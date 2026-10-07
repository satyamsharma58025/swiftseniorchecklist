import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { PageEmptyState } from "@/components/ui/PageEmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/prisma";

import { CreateUserForm } from "./_components/CreateUserForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/admin/users");
  if (session.user.role !== "MANAGER") redirect("/dashboard");

  const users: { id: string; name: string; email: string; role: string; createdAt: Date }[] = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return (
    <div className="min-h-screen py-4 text-ink md:py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader>
          <header className="border-[3px] border-ink bg-ink p-6 text-paper neo-shadow-lg">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sun-yellow">Access</p>
            <h1 className="brand-display mt-2 text-4xl">Users</h1>
            <p className="mt-2 text-sm text-paper/80">Create a user id and password for someone who needs to sign in.</p>
          </header>
        </PageHeader>

        <CreateUserForm />

        <section className="overflow-hidden border-[3px] border-ink bg-white neo-shadow-sm">
          <div data-table-scroll className="overflow-x-auto">
            <table data-responsive-table="true" className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr>
                  <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Name</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">User id</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Role</th>
                  <th className="border-[3px] border-ink px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em]">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={4} className="border-[3px] border-ink p-4"><PageEmptyState title="No users yet" description="Create the first sign-in above." href="/dashboard" actionLabel="Open dashboard" /></td></tr>
                ) : users.map((user, index) => (
                  <tr key={user.id} className={index % 2 === 0 ? "bg-white" : "bg-paper"}>
                    <td data-label="Name" className="border-[3px] border-ink px-4 py-3 font-black text-ink">{user.name}</td>
                    <td data-label="User id" className="border-[3px] border-ink px-4 py-3 font-mono text-ink">{user.email}</td>
                    <td data-label="Role" className="border-[3px] border-ink px-4 py-3"><span className="sticker bg-sun-yellow text-ink">{user.role}</span></td>
                    <td data-label="Created" className="border-[3px] border-ink px-4 py-3 text-ink">{user.createdAt.toISOString().slice(0, 10)}</td>
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
