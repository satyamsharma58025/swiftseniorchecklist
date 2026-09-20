/**
 * Pure helpers that turn a Google Form submission from the Senior Authority
 * into checklist status updates. Kept free of I/O so it can be unit tested.
 *
 * Form layout (built by integrations/google-form/FormBridge.gs):
 *   1. Checkbox question - one choice per task, formatted by `formatChoice`.
 *      Ticked = DONE.
 *   2. Paragraph question - one line per task that is NOT done:
 *        "<CHECKLIST-CODE>: reason"
 *
 * Rules (mirrors the original Apps Script / n8n behaviour):
 *   - Ticked                                  -> DONE (Done always wins)
 *   - Not ticked, has a remark                -> NOT_DONE + remark
 *   - Not ticked, no remark, currently PENDING -> NOT_DONE (default remark)
 *   - Not ticked, no remark, already DONE/NOT_DONE -> left untouched, so a
 *     partial re-submission can never silently downgrade earlier work.
 */

export type FormItemStatus = "PENDING" | "DONE" | "NOT_DONE";

export type FormItem = {
  id: string;
  checklistCode: string;
  status: FormItemStatus;
};

export type FormUpdate = {
  id: string;
  checklistCode: string;
  from: FormItemStatus;
  to: FormItemStatus;
  /** Remark to store. `undefined` means "leave seniorRemarks as it is". */
  remark?: string;
};

export type FormPlan = {
  updates: FormUpdate[];
  /** Codes that look like checklist codes but do not exist for that date. */
  unknownCodes: string[];
  unchanged: number;
};

export const DEFAULT_NOT_DONE_REMARK = "Not marked done in senior form";

const GENERIC_CODE = /CL-\d{8}-[A-Za-z0-9]+/gi;
const REMARK_LINE = /^\s*(CL-\d{8}-[A-Za-z0-9]+)\s*[:\-\u2013\u2014]\s*(.+?)\s*$/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Text shown for one task in the Google Form's checkbox list. */
export function formatChoice(input: {
  checklistCode: string;
  employeeName: string;
  taskDescription: string;
  priority?: string | null;
}): string {
  const priority = input.priority ? ` [${input.priority}]` : "";
  const base = `${input.checklistCode} \u2014 ${input.employeeName} \u2014 ${input.taskDescription}${priority}`;
  // Google Forms limits choice length; keep the code (first token) intact.
  return base.length > 300 ? `${base.slice(0, 297)}...` : base;
}

export function normalizeDoneRaw(doneRaw: unknown): string {
  if (Array.isArray(doneRaw)) {
    return doneRaw.map((entry) => String(entry)).join("\n");
  }
  return typeof doneRaw === "string" ? doneRaw : "";
}

function findCodesInText(text: string, knownCodes: string[]): { matched: Set<string>; unknown: string[] } {
  const matched = new Set<string>();

  for (const code of knownCodes) {
    // Boundary check stops "CL-20260920-AB1" from matching "CL-20260920-AB12".
    const pattern = new RegExp(`${escapeRegExp(code)}(?![A-Za-z0-9])`, "i");
    if (pattern.test(text)) {
      matched.add(code);
    }
  }

  const knownLower = new Set(knownCodes.map((code) => code.toLowerCase()));
  const unknown = Array.from(new Set(text.match(GENERIC_CODE) ?? []))
    .filter((code) => !knownLower.has(code.toLowerCase()))
    // A generic match may just be a known code followed by extra letters; skip those.
    .filter((code) => !knownCodes.some((known) => code.toLowerCase().startsWith(known.toLowerCase())));

  return { matched, unknown };
}

export function parseRemarks(remarksRaw: string, knownCodes: string[]): { remarks: Map<string, string>; unknown: string[] } {
  const remarks = new Map<string, string>();
  const unknown: string[] = [];
  const byLower = new Map(knownCodes.map((code) => [code.toLowerCase(), code]));

  for (const line of remarksRaw.split(/\r?\n/)) {
    const match = REMARK_LINE.exec(line);
    if (!match) {
      continue;
    }

    const known = byLower.get(match[1].toLowerCase());
    if (known) {
      remarks.set(known, match[2]);
    } else {
      unknown.push(match[1]);
    }
  }

  return { remarks, unknown };
}

export function planFormUpdates(
  items: FormItem[],
  submission: { doneRaw: unknown; remarksRaw?: unknown },
): FormPlan {
  const knownCodes = items.map((item) => item.checklistCode);
  const doneText = normalizeDoneRaw(submission.doneRaw);
  const remarksText = typeof submission.remarksRaw === "string" ? submission.remarksRaw : "";

  const done = findCodesInText(doneText, knownCodes);
  const remarks = parseRemarks(remarksText, knownCodes);

  const updates: FormUpdate[] = [];
  let unchanged = 0;

  for (const item of items) {
    const remark = remarks.remarks.get(item.checklistCode);

    if (done.matched.has(item.checklistCode)) {
      if (item.status !== "DONE") {
        updates.push({ id: item.id, checklistCode: item.checklistCode, from: item.status, to: "DONE" });
      } else {
        unchanged += 1;
      }
      continue;
    }

    if (remark) {
      updates.push({ id: item.id, checklistCode: item.checklistCode, from: item.status, to: "NOT_DONE", remark });
      continue;
    }

    if (item.status === "PENDING") {
      updates.push({
        id: item.id,
        checklistCode: item.checklistCode,
        from: item.status,
        to: "NOT_DONE",
        remark: DEFAULT_NOT_DONE_REMARK,
      });
      continue;
    }

    unchanged += 1;
  }

  return {
    updates,
    unknownCodes: Array.from(new Set([...done.unknown, ...remarks.unknown])),
    unchanged,
  };
}
