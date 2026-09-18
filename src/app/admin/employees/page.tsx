import { prisma } from "@/lib/prisma";

export default async function AdminEmployeesPage() {
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    include: { supervisor: { select: { name: true } }, plantHead: { select: { name: true } } },
  });

  return (
    <main className="min-h-screen bg-paper p-4 text-ink md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Roster</p>
              <h1 className="brand-display mt-2 text-4xl">Employees</h1>
            </div>
            <p className="border-[3px] border-paper bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">
              Add only via this screen
            </p>
          </div>
        </header>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Name</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Department</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Designation</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Supervisor</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee, index) => (
                  <tr key={employee.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td className="border-[3px] border-ink px-4 py-3 font-black text-ink">{employee.name}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{employee.department}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{employee.designation}</td>
                    <td className="border-[3px] border-ink px-4 py-3 text-ink">{employee.supervisor?.name ?? "—"}</td>
                    <td className="border-[3px] border-ink px-4 py-3">
                      <span className={employee.active ? "sticker bg-brand-green text-ink" : "sticker bg-paper text-ink"}>
                        {employee.active ? "Active" : "Inactive"}
                      </span>
                    </td>
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
