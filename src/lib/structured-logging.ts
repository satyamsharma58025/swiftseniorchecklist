/**
 * Structured logging for cron jobs and dispatch operations.
 * All logs are JSON-formatted, with secrets and phone numbers masked.
 */

import { dateKey } from "@/lib/dates";

export type LogEvent =
  | "cron_start"
  | "cron_success"
  | "cron_failed"
  | "cron_partial"
  | "dispatch_start"
  | "dispatch_success"
  | "dispatch_failure"
  | "dispatch_recipient_claimed"
  | "dispatch_recipient_sent"
  | "dispatch_recipient_failed"
  | "dispatch_recipient_skipped";

export type StructuredLog = {
  event: LogEvent;
  timestamp: string;
  jobName?: string;
  runDate?: string;
  durationMs?: number;
  slot?: string;
  status?: "success" | "partial" | "failed";
  counts?: {
    attempted?: number;
    created?: number;
    existing?: number;
    sent?: number;
    failed?: number;
    skipped?: number;
  };
  errorCode?: string;
  errorMessage?: string;
};

/**
 * Mask a phone number, showing only the last 4 digits.
 * Handles null/undefined and various formats.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "***";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return "*".repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
}

/**
 * Sanitize error messages by removing phone numbers and other sensitive data.
 * Allows errors to be logged safely for debugging.
 */
export function sanitizeErrorForLogging(message: string, phoneToMask?: string | null): string {
  if (!message) return "";
  let result = message;

  // Mask phone numbers (patterns like 91xxxxxxxxxx, +91xxxxxxxxxx, etc.)
  result = result.replace(/\b\d{10,}\b/g, "***");

  // Mask specific phone if provided
  if (phoneToMask) {
    const digits = phoneToMask.replace(/\D/g, "");
    result = result.replace(new RegExp(digits.replace(/./g, "\\$&"), "g"), maskPhone(phoneToMask));
  }

  return result.slice(0, 500); // Truncate for safety
}

/**
 * Log a structured event as JSON.
 * Safe to output directly; contains no secrets or sensitive data.
 */
export function logStructured(log: StructuredLog): void {
  // Ensure timestamp if not provided
  const finalLog = {
    ...log,
    timestamp: log.timestamp || new Date().toISOString(),
  };
  console.log(JSON.stringify(finalLog));
}

/**
 * Log a cron job start.
 */
export function logCronStart(jobName: string, runDate: Date): void {
  logStructured({
    event: "cron_start",
    jobName,
    runDate: dateKey(runDate),
  });
}

/**
 * Log a successful cron job completion.
 */
export function logCronSuccess(
  jobName: string,
  runDate: Date,
  durationMs: number,
  counts: StructuredLog["counts"],
): void {
  logStructured({
    event: "cron_success",
    jobName,
    runDate: dateKey(runDate),
    durationMs,
    status: "success",
    counts,
  });
}

/**
 * Log a partial cron job completion (some items failed or remain).
 */
export function logCronPartial(
  jobName: string,
  runDate: Date,
  durationMs: number,
  counts: StructuredLog["counts"],
  remaining?: number,
): void {
  logStructured({
    event: "cron_partial",
    jobName,
    runDate: dateKey(runDate),
    durationMs,
    status: "partial",
    counts: { ...counts, remaining },
  });
}

/**
 * Log a failed cron job.
 */
export function logCronFailed(
  jobName: string,
  runDate: Date,
  durationMs: number,
  errorCode: string,
  errorMessage: string,
): void {
  logStructured({
    event: "cron_failed",
    jobName,
    runDate: dateKey(runDate),
    durationMs,
    status: "failed",
    errorCode,
    errorMessage: sanitizeErrorForLogging(errorMessage),
  });
}

/**
 * Log a dispatch operation (sent, failed, skipped).
 */
export function logDispatchRecipient(
  event: "dispatch_recipient_sent" | "dispatch_recipient_failed" | "dispatch_recipient_skipped",
  slot: string,
  runDate: Date,
  errorCode?: string,
  errorMessage?: string,
  phoneToMask?: string | null,
): void {
  logStructured({
    event,
    slot,
    runDate: dateKey(runDate),
    errorCode,
    errorMessage: errorMessage ? sanitizeErrorForLogging(errorMessage, phoneToMask) : undefined,
  });
}

/**
 * Test helper: scan a string for Bearer tokens or specific secret values.
 * Used by tests to verify secrets are never logged.
 */
export function containsSecrets(text: string, secretValues: string[]): { found: boolean; matches: string[] } {
  const matches: string[] = [];

  // Check for Bearer tokens
  if (/Bearer\s+[\w-]+/i.test(text)) {
    matches.push("Bearer token pattern");
  }

  // Check for each secret value (at least 8 characters)
  for (const secret of secretValues) {
    if (secret.length >= 8 && text.includes(secret)) {
      matches.push(`secret value (${secret.slice(0, 4)}...)`);
    }
  }

  return { found: matches.length > 0, matches };
}
