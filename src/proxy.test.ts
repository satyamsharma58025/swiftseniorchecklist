import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => auth);

import { NextRequest } from "next/server";

import { proxy } from "@/proxy";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checklist route redirects", () => {
  it("returns users to the browser checklist URL after sign-in", async () => {
    auth.getToken.mockResolvedValue(null);
    const request = new NextRequest(
      "https://swiftseniorchecklist.onrender.com/checklist/2026-10-08?employeeId=employee-1",
      { headers: { "x-forwarded-host": "localhost:10000" } },
    );

    const response = await proxy(request);
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl"))
      .toBe("/checklist/2026-10-08?employeeId=employee-1");
    expect(location.searchParams.get("callbackUrl")).not.toContain("localhost:10000");
  });

  it("does not send employees into a management route after authorization denial", async () => {
    auth.getToken.mockResolvedValue({ role: "EMPLOYEE" });
    const request = new NextRequest(
      "https://swiftseniorchecklist.onrender.com/checklist/2026-10-08",
    );

    const response = await proxy(request);
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.searchParams.get("callbackUrl")).toBe("/checklist/2026-10-08");
  });
});
