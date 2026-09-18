import { describe, expect, it } from "vitest";
import {
  SCENE_PX_PER_MM,
  columnBoxes,
  defaultDivider,
  fitPage,
  mmToCssPx,
  pageGeometry,
  ruleCount,
  snapDivider,
} from "./paper";

describe("pageGeometry", () => {
  it("maps A5 portrait to scene pixels at 96 dpi", () => {
    const g = pageGeometry("A5", "portrait");
    expect(g.width).toBeCloseTo(148 * SCENE_PX_PER_MM, 6);
    expect(g.height).toBeCloseTo(210 * SCENE_PX_PER_MM, 6);
  });

  it("swaps dimensions for landscape", () => {
    const p = pageGeometry("A4", "portrait");
    const l = pageGeometry("A4", "landscape");
    expect(l.width).toBe(p.height);
    expect(l.height).toBe(p.width);
  });
});

describe("fitPage", () => {
  const a5 = pageGeometry("A5", "portrait");

  it("is limited by height on a wide desk", () => {
    const fit = fitPage(a5, { width: 2000, height: 800 });
    expect(fit.height).toBeLessThanOrEqual(800);
    // Width snaps down to a whole pixel, which can shave up to one aspect ratio of height.
    expect(800 - fit.height).toBeLessThan(a5.height / a5.width + 1e-9);
    expect(fit.width).toBeLessThan(2000);
  });

  it("is limited by width on a narrow desk", () => {
    const fit = fitPage(a5, { width: 300, height: 2000 });
    expect(fit.width).toBe(300);
    expect(fit.height).toBeLessThan(2000);
  });

  it("keeps zoom and width consistent so the scene fills the box exactly", () => {
    const fit = fitPage(a5, { width: 1234, height: 987 });
    expect(Number.isInteger(fit.width)).toBe(true);
    expect(a5.width * fit.zoom).toBeCloseTo(fit.width, 9);
    expect(a5.height * fit.zoom).toBeCloseTo(fit.height, 9);
  });
});

describe("mmToCssPx", () => {
  it("scales millimetres by dpi and zoom", () => {
    expect(mmToCssPx(25.4, 1)).toBeCloseTo(96, 9);
    expect(mmToCssPx(25.4, 0.5)).toBeCloseTo(48, 9);
  });
});

describe("ruleCount", () => {
  it("counts the rules that fit between the top and bottom margins", () => {
    expect(ruleCount(210)).toBe(26); // A5 portrait
    expect(ruleCount(297)).toBe(38); // A4 portrait
    expect(ruleCount(148)).toBe(17); // A5 landscape
    expect(ruleCount(10)).toBe(1);
  });
});

describe("columnBoxes", () => {
  it("gives one column from the margin line to the right inset", () => {
    expect(columnBoxes(148, 20, null)).toEqual([{ left: 22, width: 120 }]);
  });

  it("splits at the divider with an inset on both sides", () => {
    expect(columnBoxes(148, 20, 74)).toEqual([
      { left: 22, width: 50 },
      { left: 76, width: 66 },
    ]);
  });

  it("defaults the divider to the middle of the writable area", () => {
    expect(defaultDivider(148, 20)).toBe(84);
    expect(defaultDivider(210, 30)).toBe(120);
  });
});

describe("snapDivider", () => {
  // A5 portrait, 148mm wide, margin line at 20mm.
  it("snaps to 10mm steps", () => {
    expect(snapDivider(84, 148, 20)).toBe(80);
    expect(snapDivider(86, 148, 20)).toBe(90);
    expect(snapDivider(85, 148, 20)).toBe(90);
  });

  it("keeps each column at least 20mm of text", () => {
    // Left column: margin 20 + inset 2 + 20 + inset 2 = 44 → first step at 50.
    expect(snapDivider(0, 148, 20)).toBe(50);
    expect(snapDivider(44, 148, 20)).toBe(50);
    // Right column: 148 - 6 - 2 - 20 = 120 is the farthest.
    expect(snapDivider(140, 148, 20)).toBe(120);
    expect(snapDivider(125, 148, 20)).toBe(120);
  });
});
