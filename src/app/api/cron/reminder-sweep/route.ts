import { DateTime } from "luxon";

import { istNow } from "@/lib/dates";
import { runReminderSweep } from "@/lib/reminder-service";
import { runCronJob } from "@/lib/cron";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const timeBucket = DateTime.fromJSDate(istNow(), { zone: "UTC" })
    .setZone("Asia/Kolkata")
    .toFormat("HHmm");

  return runCronJob(
    request,
    `reminder-sweep-${timeBucket}`,
    url.searchParams.get("date"),
    (runDate) => runReminderSweep(runDate),
  );
}
