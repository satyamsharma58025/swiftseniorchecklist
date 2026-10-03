import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const colorNames = [
  "ink",
  "paper",
  "hot-pink",
  "electric-lime",
  "cyber-cyan",
  "sun-yellow",
  "grape",
  "brand-navy",
  "brand-saffron",
  "brand-green",
] as const;

const colors = Object.fromEntries(colorNames.map((name) => {
  const value = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`Missing CSS color token: ${name}`);
  return [name, value];
})) as Record<(typeof colorNames)[number], string>;

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)?.map((channel) => parseInt(channel, 16) / 255) ?? [];
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function blend(foreground: string, background: string, alpha: number): string {
  const fg = foreground.slice(1).match(/.{2}/g)?.map((channel) => parseInt(channel, 16)) ?? [];
  const bg = background.slice(1).match(/.{2}/g)?.map((channel) => parseInt(channel, 16)) ?? [];
  const channels = fg.map((channel, index) => Math.round(channel * alpha + bg[index] * (1 - alpha)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

describe("UI text contrast", () => {
  it("keeps ink text at WCAG AA on paper and all bright brand fills", () => {
    for (const background of ["paper", "hot-pink", "electric-lime", "cyber-cyan", "sun-yellow", "grape", "brand-saffron", "brand-green"] as const) {
      expect(contrastRatio(colors.ink, colors[background]), `${background} with ink`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps paper text at WCAG AA on ink and brand navy", () => {
    expect(contrastRatio(colors.paper, colors.ink), "paper with ink").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.paper, colors["brand-navy"]), "paper with brand navy").toBeGreaterThanOrEqual(4.5);
  });

  it("keeps muted and placeholder text above the specified opacity floors", () => {
    expect(contrastRatio(blend(colors.ink, colors.paper, 0.7), colors.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(blend(colors.ink, colors.paper, 0.6), colors.paper)).toBeGreaterThanOrEqual(4.5);
  });
});