import { ScorecardDashboard } from "@/app/employees/scorecard/_components/ScorecardDashboard";
import { addDays, dateKey, dbDate, istDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Employee scorecard" };

export default async function ScorecardPage() {
  const today = istDateKey();
  const firstDate = dateKey(addDays(dbDate(today), -89));
  const [employees, activity] = await Promise.all([
    prisma.employee.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, designation: true, department: true, active: true },
    }),
    prisma.dailyChecklistItem.groupBy({
      by: ["employeeName", "date", "status"],
      where: { date: { gte: dbDate(firstDate), lte: dbDate(today) } },
      _count: { _all: true },
    }),
  ]);

  return (
    <div className="min-h-screen py-4 text-ink md:py-6">
      <div className="mx-auto max-w-7xl space-y-6 px-3 sm:px-5">
        <ScorecardDashboard
          today={today}
          employees={employees}
          activity={activity.map((row) => ({
            employeeName: row.employeeName,
            date: dateKey(row.date),
            status: row.status,
            count: row._count._all,
          }))}
        />
      </div>
    </div>
  );
}
