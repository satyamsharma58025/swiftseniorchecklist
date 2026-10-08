import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  employee: { updateMany: vi.fn() },
}));
const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("next-auth/next", () => ({ getServerSession: auth.getServerSession }));

import { PATCH } from "./route";

function patch(active: unknown) {
  return PATCH(
    new Request("http://localhost/api/admin/employees/employee-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active }),
    }),
    { params: Promise.resolve({ id: "employee-1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getServerSession.mockResolvedValue({ user: { id: "manager-1", role: "MANAGER" } });
  db.employee.updateMany.mockResolvedValue({ count: 1 });
});

describe("PATCH /api/admin/employees/[id]", () => {
  it("requires a manager session", async () => {
    auth.getServerSession.mockResolvedValueOnce(null);
    expect((await patch(false)).status).toBe(401);

    auth.getServerSession.mockResolvedValueOnce({ user: { id: "senior-1", role: "SENIOR" } });
    expect((await patch(false)).status).toBe(403);
    expect(db.employee.updateMany).not.toHaveBeenCalled();
  });

  it("archives an employee without deleting their history", async () => {
    const response = await patch(false);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, active: false });
    expect(db.employee.updateMany).toHaveBeenCalledWith({
      where: { id: "employee-1" },
      data: { active: false },
    });
  });

  it("rejects malformed active values", async () => {
    const response = await patch("false");

    expect(response.status).toBe(400);
    expect(db.employee.updateMany).not.toHaveBeenCalled();
  });

  it("reports when the employee no longer exists", async () => {
    db.employee.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await patch(true)).status).toBe(404);
  });
});
