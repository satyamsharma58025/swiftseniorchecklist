import { prisma } from "@/lib/prisma";
import { toWhatsAppNumber } from "@/lib/business-logic";

async function main() {
  const today = new Date();
  const businessDate = new Date(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);

  const [employees, settings, checklistCount] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      include: { supervisor: true, reports: true },
    }),
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.dailyChecklistItem.count({ where: { date: businessDate } }),
  ]);

  const activeWithoutWhatsApp = employees.filter((employee) => !toWhatsAppNumber(employee.phone ?? null));
  const employeesWithoutSupervisor = employees.filter((employee) => !employee.supervisorId);
  const supervisorsWithoutPhone = employees.filter((employee) => employee.reports.length > 0 && !toWhatsAppNumber(employee.phone ?? null));

  const seniorPhone = settings?.seniorAuthorityPhone ?? process.env.SENIOR_AUTHORITY_PHONE ?? null;
  const seniorName = settings?.seniorAuthorityName ?? process.env.SENIOR_AUTHORITY_NAME ?? null;
  const formUrl = process.env.GOOGLE_FORM_URL?.trim() || null;
  const cronSecret = process.env.CRON_SECRET?.trim() || null;

  console.log("Integration readiness");
  console.log("- employees with no valid WhatsApp:", activeWithoutWhatsApp.map((employee) => employee.name));
  console.log("- employees with no supervisor:", employeesWithoutSupervisor.map((employee) => employee.name));
  console.log("- supervisors with no valid phone:", supervisorsWithoutPhone.map((employee) => employee.name));
  console.log("- senior authority configured:", Boolean(seniorPhone || seniorName));
  console.log("- senior phone available:", Boolean(seniorPhone));
  console.log("- form URL set:", Boolean(formUrl));
  console.log("- cron secret set:", Boolean(cronSecret));
  console.log("- daily checklist count:", checklistCount);

  const blockers: string[] = [];
  if (!seniorPhone) blockers.push("No senior phone configured");
  if (!formUrl) blockers.push("No GOOGLE_FORM_URL configured");

  if (blockers.length > 0) {
    console.error("BLOCKERS:");
    blockers.forEach((entry) => console.error(`- ${entry}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
