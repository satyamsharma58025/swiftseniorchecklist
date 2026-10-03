import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

describe("UI motion preferences", () => {
  it("uses no infinite animation except the live status pulse", () => {
    expect(css).not.toMatch(/animation:[^;]*infinite/i);
    const liveStatusPage = fs.readFileSync(path.join(process.cwd(), "src/app/checklist/[date]/page.tsx"), "utf8");
    expect(liveStatusPage).toContain("animate-pulse");
  });

  it("disables animation and transitions when reduced motion is requested", () => {
    const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(reducedMotion).toContain("animation: none !important");
    expect(reducedMotion).toContain("transition: none !important");
  });
});