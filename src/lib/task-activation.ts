import { dbDate } from "@/lib/dates";

export function taskActiveUpdateData(
  fromActive: boolean,
  toActive: boolean,
  todayKey: string,
) {
  return {
    active: toActive,
    ...(fromActive !== toActive && toActive
      ? { scheduleEffectiveFrom: dbDate(todayKey) }
      : {}),
  };
}
