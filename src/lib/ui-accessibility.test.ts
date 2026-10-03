import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function collectPageFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectPageFiles(fullPath);
    return entry.name === "page.tsx" ? [fullPath] : [];
  });
}

const appDirectory = path.join(process.cwd(), "src/app");
const pages = collectPageFiles(appDirectory);

describe("route accessibility landmarks", () => {
  it("provides a skip link, one root main target, and a PageHeader on every route", () => {
    const layout = fs.readFileSync(path.join(appDirectory, "layout.tsx"), "utf8");
    expect(layout).toContain('href="#main"');
    expect(layout).toMatch(/<main\s+id="main"/);
    for (const page of pages) {
      const source = fs.readFileSync(page, "utf8");
      expect(source, page).toContain("PageHeader");
      expect(source, page).not.toMatch(/<main\b/);
    }

    for (const boundary of ["loading.tsx", "error.tsx", "not-found.tsx"]) {
      const source = fs.readFileSync(path.join(appDirectory, boundary), "utf8");
      expect(source, boundary).toContain("PageHeader");
      expect(source, boundary).not.toMatch(/<main\b/);
    }
  });
});
