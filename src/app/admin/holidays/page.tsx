import { prisma } from "@/lib/prisma";

export default async function HolidaysPage() {
  const holidays = await prisma.holiday.findMany({
    orderBy: { date: "asc" },
  });

  return (
    <main className="min-h-screen bg-paper p-4 text-ink md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Admin</p>
          <h1 className="brand-display mt-2 text-4xl">Holiday calendar</h1>
        </header>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Date</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Name</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Applies to</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Notes</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((holiday, index) => (
                  <tr key={holiday.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{holiday.date.toISOString().slice(0, 10)}</td>
                    <td className="border-[3px] border-ink px-4 py-3 font-black text-ink">{holiday.name}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{holiday.appliesTo}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{holiday.notes ?? "—"}</td>
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
