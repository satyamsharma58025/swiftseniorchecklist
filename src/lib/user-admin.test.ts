import { describe, expect, it } from "vitest";

import { createUserSchema, normalizeLoginId } from "@/lib/user-admin";

describe("normalizeLoginId", () => {
  it("keeps real emails and lowercases them", () => {
    expect(normalizeLoginId("  Rahul@Company.com ")).toBe("rahul@company.com");
  });

  it("turns a plain user id into a login-form compatible address", () => {
    expect(normalizeLoginId("Rahul.K")).toBe("rahul.k@swiftstrips.local");
  });
});

describe("createUserSchema", () => {
  const valid = { name: "Rahul Kumar", loginId: "rahul.k", password: "Str0ngPass", role: "EMPLOYEE" as const };

  it("accepts a valid user", () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects short passwords, unknown roles and unsafe ids", () => {
    expect(createUserSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...valid, role: "ADMIN" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...valid, loginId: "bad id!" }).success).toBe(false);
  });
});
