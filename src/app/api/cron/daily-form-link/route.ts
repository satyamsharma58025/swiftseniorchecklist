import { prisma } from "@/lib/prisma";
import { ensureSettings, runCronJob } from "@/lib/cron";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return runCronJob(request, "daily-form-link", url.searchParams.get("date"), async (runDate) => {
    const settings = await ensureSettings();
    const taskCount = await prisma.dailyChecklistItem.count({ where: { date: runDate } });
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

    return {
      seniorName: settings.seniorAuthorityName ?? "Senior Authority",
      seniorPhone: settings.seniorAuthorityPhone ?? null,
      checklistUrl: `${baseUrl.replace(/\/$/, "")}/checklist/${runDate.toISOString().slice(0, 10)}`,
      taskCount,
    };
  });
}
