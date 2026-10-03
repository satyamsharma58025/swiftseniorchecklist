import fs from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "integrations/google-form/FormBridge.gs"), "utf8");
const resolverDeclaration = source.match(/function resolveSubmissionDate_\([\s\S]*?\n\}/)?.[0];

if (!resolverDeclaration) {
  throw new Error("Could not locate resolveSubmissionDate_ in FormBridge.gs");
}

const resolveSubmissionDate = runInNewContext(`${resolverDeclaration}\nresolveSubmissionDate_`) as (
  formId: string,
  properties: Record<string, string>,
) => string;

describe("FormBridge submission date resolution", () => {
  it("prefers the date stored for the exact form ID", () => {
    expect(resolveSubmissionDate("form-123", {
      "FORM_DATE_form-123": "2026-10-03",
      FORM_DATE: "2026-10-02",
    })).toBe("2026-10-03");
  });

  it("extracts only the date prefix from employee-specific form keys", () => {
    expect(resolveSubmissionDate("form-123", {
      "FORM_ID_2026-10-02_Other_Employee": "other-form",
      "FORM_ID_2026-10-03_Yogesh_Tomar": "form-123",
      FORM_DATE: "2026-10-02",
    })).toBe("2026-10-03");
  });

  it("uses the legacy date property when no per-form mapping exists", () => {
    expect(resolveSubmissionDate("missing-form", { FORM_DATE: "2026-10-03" })).toBe("2026-10-03");
  });

  it("returns an empty key when there is no date to validate", () => {
    expect(resolveSubmissionDate("missing-form", {})).toBe("");
  });
});