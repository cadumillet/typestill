import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { describe, expect, it } from "vitest";
import { HIT_TOLERANCE, hitElement, outlineDistance, toleranceFor } from "./hitTest";

const make = (id: string, extra: Record<string, unknown>): ExcalidrawElement =>
  ({
    id,
    isDeleted: false,
    strokeWidth: 2,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ...extra,
  }) as unknown as ExcalidrawElement;

/** An underline from (60, 300) to (260, 300). */
const underline = make("u", {
  type: "line",
  x: 60,
  y: 300,
  points: [
    [0, 0],
    [200, 0],
  ],
});
/** A box from (100, 100) to (300, 200). */
const box = make("b", { type: "rectangle", x: 100, y: 100, width: 200, height: 100 });
const ellipse = make("e", { type: "ellipse", x: 100, y: 400, width: 200, height: 100 });
const text = make("t", { type: "text", x: 400, y: 100, width: 120, height: 40 });
const arrow = make("a", {
  type: "arrow",
  x: 400,
  y: 300,
  points: [
    [0, 0],
    [100, 50],
  ],
});

describe("hit test", () => {
  it("hits an underline on its stroke and near it, not away from it", () => {
    expect(hitElement([underline], { x: 160, y: 300 })?.id).toBe("u");
    expect(hitElement([underline], { x: 160, y: 305 })?.id).toBe("u");
    expect(hitElement([underline], { x: 160, y: 308 })).toBeNull();
    expect(hitElement([underline], { x: 270, y: 300 })).toBeNull();
    expect(outlineDistance(underline, { x: 160, y: 310 })).toBe(10);
  });

  it("hits a rectangle on its edge, not inside it away from the edges", () => {
    expect(hitElement([box], { x: 200, y: 150 })).toBeNull();
    expect(hitElement([box], { x: 200, y: 100 })?.id).toBe("b");
    expect(hitElement([box], { x: 300, y: 130 })?.id).toBe("b");
    expect(hitElement([box], { x: 200, y: 204 })?.id).toBe("b");
    expect(hitElement([box], { x: 200, y: 208 })).toBeNull();
  });

  it("hits an ellipse on its outline by the radial distance", () => {
    expect(hitElement([ellipse], { x: 300, y: 450 })?.id).toBe("e");
    expect(hitElement([ellipse], { x: 200, y: 400 })?.id).toBe("e");
    expect(hitElement([ellipse], { x: 200, y: 450 })).toBeNull();
    expect(outlineDistance(ellipse, { x: 200, y: 450 })).toBe(50);
    expect(outlineDistance(ellipse, { x: 200, y: 430 })).toBeCloseTo(30);
  });

  it("hits a drawn text anywhere in its box", () => {
    expect(hitElement([text], { x: 460, y: 120 })?.id).toBe("t");
    expect(hitElement([text], { x: 400, y: 100 })?.id).toBe("t");
    expect(hitElement([text], { x: 530, y: 120 })).toBeNull();
  });

  it("hits an arrow along its shaft", () => {
    expect(hitElement([arrow], { x: 450, y: 325 })?.id).toBe("a");
    expect(hitElement([arrow], { x: 450, y: 340 })).toBeNull();
  });

  it("takes the last element in order when two overlap, and skips deleted ones", () => {
    const over = make("o", { type: "rectangle", x: 100, y: 250, width: 200, height: 100 });
    // The underline's stroke crosses the box's bottom edge? No: the box's top edge is at y 250 and the
    // underline at 300, which is inside the box; a point on the underline hits only it.
    expect(hitElement([over, underline], { x: 160, y: 300 })?.id).toBe("u");
    const twin = make("w", { ...underline, id: "w" } as unknown as Record<string, unknown>);
    expect(hitElement([underline, twin], { x: 160, y: 300 })?.id).toBe("w");
    expect(hitElement([twin, underline], { x: 160, y: 300 })?.id).toBe("u");
    const gone = { ...twin, isDeleted: true } as ExcalidrawElement;
    expect(hitElement([underline, gone], { x: 160, y: 300 })?.id).toBe("u");
  });

  it("widens the tolerance for a thick stroke", () => {
    expect(toleranceFor({ strokeWidth: 2 })).toBe(HIT_TOLERANCE);
    expect(toleranceFor({ strokeWidth: 4 })).toBe(HIT_TOLERANCE);
    expect(toleranceFor({ strokeWidth: 8 })).toBe(8);
    const thick = { ...underline, strokeWidth: 8 } as ExcalidrawElement;
    expect(hitElement([thick], { x: 160, y: 307.5 })?.id).toBe("u");
  });
});
