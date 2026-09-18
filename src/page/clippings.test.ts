import { describe, expect, it } from "vitest";
import {
  MIN_CLIPPING_WIDTH_MM,
  clippingAt,
  clippingFileIds,
  isClipping,
  placeClipping,
  resizeClipping,
  type Clipping,
} from "./clippings";
import { SCENE_PX_PER_MM } from "./paper";

const clipping: Clipping = { id: "c1", fileId: "f1", x: 10, y: 20, width: 40, layer: "over" };

describe("isClipping", () => {
  it("accepts the stored shape and rejects anything else", () => {
    expect(isClipping(clipping)).toBe(true);
    expect(isClipping({ ...clipping, layer: "under" })).toBe(true);
    expect(isClipping({ ...clipping, layer: "middle" })).toBe(false);
    expect(isClipping({ ...clipping, width: 0 })).toBe(false);
    expect(isClipping({ ...clipping, x: "10" })).toBe(false);
    expect(isClipping({ ...clipping, fileId: "" })).toBe(false);
    expect(isClipping(null)).toBe(false);
  });

  it("lists file ids once", () => {
    expect(
      clippingFileIds([clipping, { ...clipping, id: "c2" }, { ...clipping, fileId: "f2" }]),
    ).toEqual(["f1", "f2"]);
  });
});

describe("placeClipping", () => {
  const page = { width: 148, height: 210 };

  it("centres the image at its natural size in mm, on top", () => {
    const placed = placeClipping(
      page,
      { width: 40 * SCENE_PX_PER_MM, height: 20 * SCENE_PX_PER_MM },
      { id: "c", fileId: "f" },
    );
    expect(placed.width).toBeCloseTo(40);
    expect(placed.x).toBeCloseTo(54);
    expect(placed.y).toBeCloseTo(95);
    expect(placed.layer).toBe("over");
  });

  it("caps the width at half the page", () => {
    const placed = placeClipping(page, { width: 2000, height: 1000 }, { id: "c", fileId: "f" });
    expect(placed.width).toBe(74);
    expect(placed.x).toBe(37);
  });
});

describe("resizeClipping", () => {
  // 40 x 20 mm at (10, 20): corners at (10,20), (50,20), (10,40), (50,40).
  const aspect = 0.5;

  it("keeps the opposite corner in place and the proportions", () => {
    const se = resizeClipping(clipping, aspect, "se", { x: 70, y: 30 });
    expect(se).toMatchObject({ x: 10, y: 20, width: 60 });
    const nw = resizeClipping(clipping, aspect, "nw", { x: 20, y: 0 });
    // dy = 40 asks for width 80; the far corner stays at (50, 40).
    expect(nw.width).toBe(80);
    expect(nw.x).toBe(-30);
    expect(nw.y).toBe(0);
    const ne = resizeClipping(clipping, aspect, "ne", { x: 30, y: 35 });
    expect(ne).toMatchObject({ x: 10, width: 20 });
    expect(ne.y).toBe(30);
    const sw = resizeClipping(clipping, aspect, "sw", { x: 40, y: 25 });
    expect(sw).toMatchObject({ y: 20, width: 10 });
    expect(sw.x).toBe(40);
  });

  it("never goes below the minimum width", () => {
    const tiny = resizeClipping(clipping, aspect, "se", { x: 11, y: 21 });
    expect(tiny.width).toBe(MIN_CLIPPING_WIDTH_MM);
    expect(tiny).toMatchObject({ x: 10, y: 20 });
  });
});

describe("clippingAt", () => {
  it("finds the topmost clipping under a point, skipping ones not yet measured", () => {
    const under: Clipping = { ...clipping, id: "c0", layer: "under" };
    const aspects = new Map([
      ["c0", 0.5],
      ["c1", 0.5],
    ]);
    expect(clippingAt([under, clipping], aspects, { x: 20, y: 30 })?.id).toBe("c1");
    expect(clippingAt([under, clipping], aspects, { x: 20, y: 45 })).toBeNull();
    expect(clippingAt([clipping], new Map(), { x: 20, y: 30 })).toBeNull();
  });
});
