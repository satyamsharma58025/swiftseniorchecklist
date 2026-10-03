import { ensureDailyQueueAndLock } from "@/lib/daily-task-service";
import { runCronJob } from "@/lib/cron";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return runCronJob(request, "daily-sync", url.searchParams.get("date"), ensureDailyQueueAndLock);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const date = typeof body.date === "string" ? body.date : null;
  return runCronJob(request, "daily-sync", date, ensureDailyQueueAndLock);
}