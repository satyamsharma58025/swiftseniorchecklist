import { DeleteEmployeeButton } from "@/app/admin/employees/_components/DeleteEmployeeButton";
import { PageEmptyState } from "@/components/ui/PageEmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Employees" };

export default async function AdminEmployeesPage() {
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    include: { supervisor: { select: { name: true } }, plantHead: { select: { name: true } } },
  });

  return (
    <div className="min-h-screen py-4 text-ink md:py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader>
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
        </PageHeader>

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div data-table-scroll className="overflow-x-auto">
            <table data-responsive-table="true" className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Name</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Department</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Designation</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Supervisor</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Status</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan={6} className="border-[3px] border-ink p-4"><PageEmptyState title="Employee roster is empty" description="Import the active employee roster before assigning tasks." href="/admin/tasks" actionLabel="Open task master" /></td></tr>
                ) : employees.map((employee, index) => (
                  <tr key={employee.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td data-label="Name" className="border-[3px] border-ink px-4 py-3 font-black text-ink">{employee.name}</td>
                    <td data-label="Department" className="border-[3px] border-ink px-4 py-3 text-ink">{employee.department}</td>
                    <td data-label="Designation" className="border-[3px] border-ink px-4 py-3 text-ink">{employee.designation}</td>
                    <td data-label="Supervisor" className="border-[3px] border-ink px-4 py-3 text-ink">{employee.supervisor?.name ?? "—"}</td>
                    <td data-label="Status" className="border-[3px] border-ink px-4 py-3">
                      <span className={employee.active ? "sticker bg-brand-green text-ink" : "sticker bg-paper text-ink"}>
                        {employee.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td data-label="Actions" className="border-[3px] border-ink px-4 py-3">
                      <DeleteEmployeeButton employeeId={employee.id} employeeName={employee.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
