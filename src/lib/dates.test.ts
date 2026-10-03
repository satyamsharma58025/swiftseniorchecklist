import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { addDays, dateKey, dbDate, istDateKey, istDayBounds } from "@/lib/dates";

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if ([".git", ".next", "coverage", "node_modules"].includes(entry.name)) {
        return [];
      }
      return sourceFiles(entryPath);
    }
    return /\.(ts|tsx|js|jsx|mjs|cjs|gs|json)$/.test(entry.name) ? [entryPath] : [];
  });
}

describe("canonical business dates", () => {
  it("uses the Asia/Kolkata calendar date for an instant", () => {
    expect(istDateKey(new Date("2026-10-02T18:30:00.000Z"))).toBe("2026-10-03");
    expect(istDateKey(new Date("2026-10-03T18:29:59.999Z"))).toBe("2026-10-03");
    expect(istDateKey(new Date("2026-10-03T18:30:00.000Z"))).toBe("2026-10-04");
    expect(istDateKey(new Date("2026-10-03T05:29:00.000Z"))).toBe("2026-10-03");
    expect(istDateKey(new Date("2026-10-03T18:30:00.000Z"))).toBe("2026-10-04");
  });

  it("constructs a validated UTC-midnight database date", () => {
    expect(dbDate("2026-10-03").toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(() => dbDate("2026-13-40")).toThrow("Invalid business date key");
    expect(() => dbDate("2026-10-03_Yogesh_Tomar")).toThrow("Invalid business date key");
  });

  it("formats Date inputs in UTC and adds whole days", () => {
    expect(dateKey(dbDate("2026-10-03"))).toBe("2026-10-03");
  });

  it.each([
    ["2026-01-31", "2026-02-01"],
    ["2026-02-28", "2026-03-01"],
    ["2024-02-28", "2024-02-29"],
    ["2024-02-29", "2024-03-01"],
    ["2026-04-30", "2026-05-01"],
    ["2026-07-31", "2026-08-01"],
    ["2026-12-31", "2027-01-01"],
  ])("adds one day after %s", (from, to) => {
    expect(dateKey(addDays(dbDate(from), 1))).toBe(to);
  });

  it("creates a timestamp range for one IST business day", () => {
    const bounds = istDayBounds("2026-10-03");
    expect(bounds.start.toISOString()).toBe("2026-10-02T18:30:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-10-03T18:29:59.999Z");
  });

  it("forbids ad hoc business-date construction outside dates.ts", () => {
    const forbiddenPatterns = [
      /new\s+Date\s*\(\s*`[^`]*T00:00:00(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?`/,
      /DateTime\.fromISO\([\s\S]{0,120}?\{\s*zone:\s*["']Asia\/Kolkata["']\s*\}\)\s*\.startOf\(["']day["']\)\s*\.toJSDate\(\)/,
    ];
    const files = sourceFiles(process.cwd());
    const violations = files
      .filter((filePath) => path.normalize(filePath) !== path.normalize("src/lib/dates.ts"))
      .flatMap((filePath) => {
        const text = fs.readFileSync(filePath, "utf8");
        return forbiddenPatterns
          .filter((pattern) => pattern.test(text))
          .map(() => path.relative(process.cwd(), filePath));
      });

    expect(violations).toEqual([]);
  });
});
