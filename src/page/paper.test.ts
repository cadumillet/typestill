import { describe, expect, it } from "vitest";
import { SCENE_PX_PER_MM, fitPage, mmToCssPx, pageGeometry } from "./paper";

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
