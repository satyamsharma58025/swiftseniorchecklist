import { prisma } from "@/lib/prisma";

export default async function HolidaysPage() {
  const holidays = await prisma.holiday.findMany({
    orderBy: { date: "asc" },
  });

  return (
    <main className="min-h-screen bg-brand-cream p-4 text-brand-navy md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy p-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-saffron">Admin</p>
          <h1 className="mt-2 text-3xl font-bold">Holiday calendar</h1>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-brand-cream text-brand-navy/70">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Applies to</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((holiday) => (
                  <tr key={holiday.id} className="border-t border-brand-navy/10">
                    <td className="px-4 py-3">{holiday.date.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-3 font-medium">{holiday.name}</td>
                    <td className="px-4 py-3">{holiday.appliesTo}</td>
                    <td className="px-4 py-3">{holiday.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
