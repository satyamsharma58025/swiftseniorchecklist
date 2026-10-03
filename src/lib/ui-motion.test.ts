import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

describe("UI motion preferences", () => {
  it("allows the marquee loop and live status pulse, but no other infinite CSS animation", () => {
    const infiniteAnimations = [...css.matchAll(/animation:\s*([^;]*infinite[^;]*);/gi)];
    expect(infiniteAnimations).toHaveLength(1);
    expect(infiniteAnimations[0][1]).toContain("marquee 22s linear");
    const liveStatusPage = fs.readFileSync(path.join(process.cwd(), "src/app/checklist/[date]/page.tsx"), "utf8");
    expect(liveStatusPage).toContain("animate-pulse");
  });

  it("disables animation and transitions when reduced motion is requested", () => {
    const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(reducedMotion).toContain("animation: none !important");
    expect(reducedMotion).toContain("transition: none !important");
  });
});