import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { TopMarquee } from "./TopMarquee";

const root = process.cwd();

describe("TopMarquee", () => {
  it("renders on the root shell before the sticky navigation", () => {
    const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
    const appNav = fs.readFileSync(path.join(root, "src/components/AppNav.tsx"), "utf8");
    expect(layout).toContain("<AppNav />");
    expect(appNav.indexOf("<TopMarquee />")).toBeLessThan(appNav.indexOf("<AppNavigation"));
  });

  it("duplicates the loop and hides the duplicate copy from assistive technology", () => {
    const markup = renderToStaticMarkup(createElement(TopMarquee));
    expect(markup).toContain('role="presentation"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/Swift Strips India/g)).toHaveLength(2);
    expect(markup.match(/Daily ops board/g)).toHaveLength(2);
  });

  it("keeps the marquee above a sticky nav sibling", () => {
    const source = fs.readFileSync(path.join(root, "src/components/AppNavigation.tsx"), "utf8");
    expect(source).toMatch(/className="main-nav-row sticky top-0/);
    const appNav = fs.readFileSync(path.join(root, "src/components/AppNav.tsx"), "utf8");
    expect(appNav).toContain("<TopMarquee />");
    expect(appNav).toContain("<AppNavigation");
  });

  it("uses a CSS-only 22 second loop, hover/focus pause, and a static reduced-motion mode", () => {
    const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
    expect(css).toContain("height: 32px");
    expect(css).toContain("height: 36px");
    expect(css).toContain("animation: marquee 22s linear infinite");
    expect(css).toContain("translateX(-50%)");
    expect(css).toContain(".marquee:hover .marquee__track");
    expect(css).toContain("body:has(.main-nav-row:focus-within) .marquee__track");
    const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(reducedMotion).toContain(".marquee__track");
    expect(reducedMotion).toContain("animation: none !important");
    expect(reducedMotion).toContain(".marquee__group[aria-hidden=\"true\"]");
  });
});
