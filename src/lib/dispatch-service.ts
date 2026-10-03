import { DateTime } from "luxon";
import type { DispatchSlot, PrismaClient } from "@prisma/client";

import { formatChoice } from "@/lib/form-submission";
import { dateKey } from "@/lib/dates";
import { toWhatsAppNumber } from "@/lib/business-logic";
import {
  claimDispatch,
  completeDispatchAttempt,
  markDispatchPermanentFailure,
  recordDispatchSkip,
} from "@/lib/dispatch-ledger";
import { selectDispatchRecipients, type DispatchChecklistInput } from "@/lib/dispatch-slots";
import { ensureDailyQueueAndLock } from "@/lib/daily-task-service";
import { prisma } from "@/lib/prisma";

const RECIPIENT_CAP = 60;
const TIME_BUDGET_MS = 240_000;
const SEND_SPACING_MS = 300;
const MAX_ERROR_LENGTH = 1000;

type DispatchClient = Pick<PrismaClient, "dailyChecklistItem" | "employee" | "reassignment" | "dispatchLog" | "notificationLog">;

type DeliveryFailure = {
  permanent: boolean;
  message: string;
};

type DispatchRecipientRecord = ReturnType<typeof selectDispatchRecipients>[number];

export type DispatchResult = {
  date: string;
  slot: DispatchSlot | null;
  enabled: boolean;
  dryRun: boolean;
  planned: number;
  sent: number;
  skipped: number;
  failed: number;
  remaining: number;
  permanentFailures: Array<{ employee: string; error: string }>;
};

export type DispatchRunOptions = {
  date: Date;
  slot: DispatchSlot | null;
  enabled: boolean;
  dryRun?: boolean;
  allowlist?: string | null;
  maxRecipients?: number;
  timeBudgetMs?: number;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  fetcher?: typeof fetch;
  database?: DispatchClient;
  ensureGeneration?: typeof ensureDailyQueueAndLock;
};

function maskPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : "<no-phone>";
}

function sanitizeError(message: string, phone: string | null | undefined): string {
  const originalPhone = String(phone ?? "");
  const normalized = toWhatsAppNumber(originalPhone);
  return message
    .replaceAll(originalPhone, maskPhone(originalPhone))
    .replaceAll(normalized ?? "\u0000", maskPhone(originalPhone))
    .replace(/\b\d{10,15}\b/g, (digits) => `***${digits.slice(-4)}`)
    .slice(0, MAX_ERROR_LENGTH);
}

function parseAllowlist(raw: string | null | undefined): Set<string> | null {
  const values = (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return values.length ? new Set(values.map((value) => {
    const phone = toWhatsAppNumber(value);
    return phone ?? (/^[+\d\s()-]+$/.test(value) ? value.replace(/\D/g, "") : value);
  })) : null;
}

function matchesAllowlist(recipient: DispatchRecipientRecord, allowlist: Set<string> | null): boolean {
  if (!allowlist) return true;
  const normalizedPhone = toWhatsAppNumber(recipient.phone);
  const digits = String(recipient.phone ?? "").replace(/\D/g, "");
  return allowlist.has(recipient.employeeId) || Boolean(normalizedPhone && allowlist.has(normalizedPhone)) || Boolean(digits && allowlist.has(digits));
}

async function loadRecipients(date: Date, slot: DispatchSlot, database: DispatchClient): Promise<DispatchRecipientRecord[]> {
  const rows = await database.dailyChecklistItem.findMany({
    where: { date },
    select: {
      id: true,
      checklistCode: true,
      employeeName: true,
      employeePhone: true,
      taskDescription: true,
      priority: true,
      status: true,
      taskMasterId: true,
      taskMaster: { select: { employeeId: true } },
    },
  });
  const taskMasterIds = Array.from(new Set(rows.map((row) => row.taskMasterId).filter(Boolean)));
  if (!taskMasterIds.length) return [];

  const reassignments = await database.reassignment.findMany({
    where: { taskMasterId: { in: taskMasterIds }, effectiveDate: { lte: date } },
    orderBy: { effectiveDate: "desc" },
    select: { taskMasterId: true, newEmployeeId: true },
  });
  const assignedByTask = new Map<string, string>();
  for (const reassignment of reassignments) {
    if (!assignedByTask.has(reassignment.taskMasterId)) assignedByTask.set(reassignment.taskMasterId, reassignment.newEmployeeId);
  }

  const employeeIds = Array.from(new Set(rows.map((row) =>
    assignedByTask.get(row.taskMasterId) ?? row.taskMaster?.employeeId,
  ).filter((id): id is string => Boolean(id))));
  const employees = employeeIds.length
    ? await database.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true, phone: true } })
    : [];
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  const dispatchItems: DispatchChecklistInput[] = rows.flatMap((row) => {
    const employeeId = assignedByTask.get(row.taskMasterId) ?? row.taskMaster?.employeeId;
    if (!employeeId) return [];
    const employee = employeeById.get(employeeId);
    return [{
      employeeId,
      employeeName: row.employeeName || employee?.name || "Unknown employee",
      phone: row.employeePhone ?? employee?.phone ?? null,
      id: row.id,
      checklistCode: row.checklistCode,
      taskDescription: row.taskDescription,
      priority: row.priority,
      status: row.status,
    }];
  });
  return selectDispatchRecipients(dispatchItems, slot);
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({}));
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

function failureMessage(body: Record<string, unknown>, fallback: string): string {
  const error = body.error;
  if (error && typeof error === "object") {
    const item = error as Record<string, unknown>;
    const details = item.error_data && typeof item.error_data === "object"
      ? (item.error_data as Record<string, unknown>).details
      : undefined;
    return String(item.message ?? item.error_user_msg ?? details ?? fallback);
  }
  return String(error ?? body.message ?? fallback);
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function requestFormLink(
  recipient: DispatchRecipientRecord,
  choices: string[],
  date: Date,
  slot: DispatchSlot,
  fetcher: typeof fetch,
): Promise<string> {
  const bridgeUrl = process.env.APPS_SCRIPT_WEBAPP_URL?.trim();
  const bridgeSecret = process.env.FORM_BRIDGE_SECRET;
  if (!bridgeUrl || !bridgeSecret) throw { permanent: true, message: "APPS_SCRIPT_WEBAPP_URL or FORM_BRIDGE_SECRET is not configured" } satisfies DeliveryFailure;

  const actions = slot === "MORNING" ? ["refresh"] : ["link", "refresh"];
  for (const action of actions) {
    let response: Response;
    try {
      response = await fetcher(bridgeUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          secret: bridgeSecret,
          action,
          date: dateKey(date),
          employeeName: recipient.employeeName,
          employeePhone: recipient.phone,
          choices,
        }),
      });
    } catch (error) {
      throw { permanent: false, message: String(error) } satisfies DeliveryFailure;
    }

    const body = await responseBody(response);
    if (!response.ok || body.ok !== true) {
      const message = failureMessage(body, `Apps Script returned HTTP ${response.status}`);
      if (action === "link" && body.error === "form_not_found") continue;
      throw { permanent: !isTransientStatus(response.status), message } satisfies DeliveryFailure;
    }
    const link = body.formUrl ?? body.publishedUrl;
    if (typeof link === "string" && link) return link;
    throw { permanent: true, message: "Apps Script returned no form URL" } satisfies DeliveryFailure;
  }

  throw { permanent: true, message: "Apps Script form is not available" } satisfies DeliveryFailure;
}

function dateParameter(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "UTC" }).toFormat("dd-LLL-yyyy");
}

async function sendWhatsApp(
  phone: string,
  templateName: string,
  date: Date,
  formUrl: string,
  fetcher: typeof fetch,
): Promise<string> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) throw { permanent: true, message: "WhatsApp Cloud API configuration is missing" } satisfies DeliveryFailure;

  let response: Response;
  try {
    response = await fetcher(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toWhatsAppNumber(phone),
        type: "template",
        template: {
          name: templateName,
          language: { code: "en_US" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: dateParameter(date) },
              { type: "text", text: formUrl },
            ],
          }],
        },
      }),
    });
  } catch (error) {
    throw { permanent: false, message: String(error) } satisfies DeliveryFailure;
  }

  const body = await responseBody(response);
  if (!response.ok) {
    throw {
      permanent: !isTransientStatus(response.status),
      message: failureMessage(body, `WhatsApp Cloud API returned HTTP ${response.status}`),
    } satisfies DeliveryFailure;
  }
  const providerMessageId = (body.messages as Array<{ id?: string }> | undefined)?.[0]?.id;
  if (!providerMessageId) throw { permanent: true, message: "WhatsApp API response omitted provider message ID" } satisfies DeliveryFailure;
  return providerMessageId;
}

function getFailure(error: unknown): DeliveryFailure {
  if (error && typeof error === "object" && "permanent" in error && "message" in error) {
    return error as DeliveryFailure;
  }
  return { permanent: false, message: error instanceof Error ? error.message : String(error) };
}

function loggerFailure(date: Date, slot: DispatchSlot, employeeId: string, phone: string | null, status: string, error: string) {
  console.error(JSON.stringify({
    event: "dispatch_delivery_failure",
    date: dateKey(date),
    slot,
    employeeId,
    phone: maskPhone(phone),
    status,
    error: sanitizeError(error, phone),
  }));
}

export async function runDispatch(options: DispatchRunOptions): Promise<DispatchResult> {
  const database = options.database ?? prisma;
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const maxRecipients = options.maxRecipients ?? RECIPIENT_CAP;
  const timeBudgetMs = options.timeBudgetMs ?? TIME_BUDGET_MS;
  const startedAt = now().getTime();
  const dateString = dateKey(options.date);
  const result: DispatchResult = {
    date: dateString,
    slot: options.slot,
    enabled: options.enabled,
    dryRun: options.dryRun ?? !options.enabled,
    planned: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
    permanentFailures: [],
  };

  const generation = await (options.ensureGeneration ?? ensureDailyQueueAndLock)(options.date);
  result.failed += generation.failed.length;
  const slot = options.slot;
  if (!slot) {
    if (generation.failed.length) result.remaining = generation.failed.length;
    return result;
  }

  const allowlist = parseAllowlist(options.allowlist ?? process.env.DISPATCH_ALLOWLIST);
  const recipients = (await loadRecipients(options.date, slot, database)).filter((recipient) => matchesAllowlist(recipient, allowlist));
  result.planned = recipients.length;
  if (!options.enabled || result.dryRun) {
    result.remaining = recipients.length;
    return result;
  }

  const templateName = slot === "MORNING" ? "senior_daily_checklist" : "checklist_pending_reminder";
  let processed = 0;
  for (let index = 0; index < recipients.length; index += 1) {
    if (processed >= maxRecipients || now().getTime() - startedAt >= timeBudgetMs) {
      result.remaining += recipients.length - index;
      break;
    }
    if (processed > 0) {
      await sleep(SEND_SPACING_MS);
      if (now().getTime() - startedAt >= timeBudgetMs) {
        result.remaining += recipients.length - index;
        break;
      }
    }

    const recipient = recipients[index];
    processed += 1;
    const phone = recipient.phone ?? "";
    const claimInput = { date: options.date, slot, employeeId: recipient.employeeId, phone, templateName };
    let claimedRowId: string | null = null;
    try {
      if (!recipient.shouldSend) {
        await recordDispatchSkip(claimInput, "SKIPPED_NO_TASKS", database, now());
        result.skipped += 1;
        continue;
      }
      if (!toWhatsAppNumber(phone)) {
        await recordDispatchSkip(claimInput, "SKIPPED_NO_PHONE", database, now());
        result.skipped += 1;
        continue;
      }

      const matchingTasks = slot === "MORNING" ? recipient.tasks : recipient.tasks.filter((task) => task.status !== "DONE");
      const choices = matchingTasks.map((task) => formatChoice({
        checklistCode: task.checklistCode,
        employeeName: recipient.employeeName,
        taskDescription: task.taskDescription,
        priority: task.priority,
      }));

      const claim = await claimDispatch(claimInput, database, now());
      if (!claim.claimed) {
        if (["already_sent", "legacy_sent", "skipped"].includes(claim.reason ?? "")) {
          result.skipped += 1;
        } else if (claim.reason === "permanent_failure" || claim.reason === "retry_exhausted") {
          result.failed += 1;
          const message = sanitizeError(claim.row.lastError ?? "Dispatch attempts exhausted", phone);
          result.permanentFailures.push({ employee: recipient.employeeName, error: message });
          await markDispatchPermanentFailure(database, claim.row.id, message, now());
        } else {
          result.remaining += 1;
        }
        continue;
      }
      claimedRowId = claim.row.id;

      const formUrl = await requestFormLink(recipient, choices, options.date, slot, fetcher);
      const providerMessageId = await sendWhatsApp(phone, templateName, options.date, formUrl, fetcher);
      await completeDispatchAttempt(database, claim.row.id, {
        status: "SENT",
        phone,
        providerMessageId,
        formUrl,
        sentAt: now(),
        lastAttemptAt: now(),
      });
      result.sent += 1;
    } catch (error) {
      const classified = getFailure(error);
      const safeMessage = sanitizeError(classified.message, phone);
      if (claimedRowId) {
        await completeDispatchAttempt(database, claimedRowId, {
          status: classified.permanent ? "FAILED_PERMANENT" : "FAILED",
          phone,
          lastError: safeMessage,
          lastAttemptAt: now(),
        });
      }
      result.failed += 1;
      loggerFailure(options.date, slot, recipient.employeeId, phone, classified.permanent ? "FAILED_PERMANENT" : "FAILED", safeMessage);
      if (classified.permanent) result.permanentFailures.push({ employee: recipient.employeeName, error: safeMessage });
    }
  }

  return result;
}
