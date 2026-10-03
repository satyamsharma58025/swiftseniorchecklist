import { DateTime } from "luxon";

const BUSINESS_TIMEZONE = "Asia/Kolkata";
const DATE_KEY_FORMAT = "yyyy-MM-dd";
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istNow(): Date {
  return DateTime.now().setZone(BUSINESS_TIMEZONE).toJSDate();
}

export function istDateKey(now: Date = istNow()): string {
  return DateTime.fromJSDate(now, { zone: "UTC" })
    .setZone(BUSINESS_TIMEZONE)
    .toFormat(DATE_KEY_FORMAT);
}

export function dbDate(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new Error(`Invalid business date key: ${key}`);
  }

  const parsed = DateTime.fromISO(key, { zone: "UTC" });
  if (!parsed.isValid || parsed.toFormat(DATE_KEY_FORMAT) !== key) {
    throw new Error(`Invalid business date key: ${key}`);
  }

  return parsed.startOf("day").toJSDate();
}

export function dateKey(value: Date | string): string {
  const parsed = typeof value === "string"
    ? DateTime.fromISO(value, { zone: "UTC" })
    : DateTime.fromJSDate(value, { zone: "UTC" });
  if (!parsed.isValid) {
    throw new Error("Invalid date value");
  }

  const key = parsed.toUTC().toFormat(DATE_KEY_FORMAT);
  dbDate(key);
  return key;
}

export function addDays(date: Date | string, days: number): Date {
  if (!Number.isInteger(days)) {
    throw new Error(`Day offset must be an integer: ${days}`);
  }

  const nextKey = DateTime.fromISO(dateKey(date), { zone: "UTC" })
    .plus({ days })
    .toFormat(DATE_KEY_FORMAT);
  return dbDate(nextKey);
}

export function istDayBounds(key: string): { start: Date; end: Date } {
  const startTime = dbDate(key).getTime() - IST_OFFSET_MS;
  return {
    start: new Date(startTime),
    end: new Date(startTime + DAY_MS - 1),
  };
}
