import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function collectFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    return entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

const routeFiles = collectFiles(path.join(process.cwd(), "src/app"));

describe("mobile table layout contract", () => {
  it("marks each route table for mobile card layout and labels its data cells", () => {
    const tables = routeFiles.flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return [...source.matchAll(/<table\b([\s\S]*?)>/g)].map((match) => ({ filePath, source, attributes: match[1] }));
    });

    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(table.attributes, table.filePath).toContain("data-responsive-table");
      const dataCells = [...table.source.matchAll(/<td\b([^>]*)>/g)].filter((match) => !/colSpan|colspan/.test(match[1]));
      for (const cell of dataCells) {
        expect(cell[1], table.filePath).toContain("data-label");
      }
    }
  });

  it("uses the 768px mobile breakpoint to stack labeled rows", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("table[data-responsive-table] tbody tr");
    expect(css).toContain("content: attr(data-label)");
    expect(css).toContain("[data-table-scroll]");
  });
});
