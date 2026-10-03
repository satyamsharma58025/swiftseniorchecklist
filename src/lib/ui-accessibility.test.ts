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

function assertMainTarget(filePath: string) {
  const source = fs.readFileSync(filePath, "utf8");
  if (source.includes("<main")) {
    expect(source, filePath).toMatch(/<main\b[^>]*\bid="main-content"/);
  }
}

describe("route accessibility landmarks", () => {
  it("provides a skip link and main target on every rendered page", () => {
    const layout = fs.readFileSync(path.join(appDirectory, "layout.tsx"), "utf8");
    expect(layout).toContain('href="#main-content"');
    for (const page of pages) assertMainTarget(page);

    for (const boundary of ["loading.tsx", "error.tsx", "not-found.tsx"]) {
      assertMainTarget(path.join(appDirectory, boundary));
    }
  });
});
