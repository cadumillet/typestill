import { describe, expect, it } from "vitest";
import {
  DEAD_ZONE_PX,
  QUICK_ELEMENTS,
  boxOf,
  isBoxDrag,
  isDrag,
  nextElement,
  snapTo15,
  toScene,
  toSceneBox,
} from "./quickLine";

const close = (point: { x: number; y: number }, x: number, y: number) => {
  expect(point.x).toBeCloseTo(x, 6);
  expect(point.y).toBeCloseTo(y, 6);
};

describe("quick line", () => {
  it("snaps the end to the nearest 15° from the start, keeping the length", () => {
    const start = { x: 100, y: 100 };
    // A hair off horizontal is horizontal, either way.
    close(snapTo15(start, { x: 300, y: 103 }), 100 + Math.hypot(200, 3), 100);
    close(snapTo15(start, { x: 300, y: 97 }), 100 + Math.hypot(200, 3), 100);
    close(snapTo15(start, { x: -100, y: 102 }), 100 - Math.hypot(200, 2), 100);
    // A hair off vertical is vertical.
    close(snapTo15(start, { x: 102, y: 300 }), 100, 100 + Math.hypot(2, 200));
    // 40° goes to 45°, 50° too; 37° goes to 30°.
    const at = (deg: number, length = 100) => ({
      x: start.x + Math.cos((deg * Math.PI) / 180) * length,
      y: start.y + Math.sin((deg * Math.PI) / 180) * length,
    });
    close(snapTo15(start, at(40)), at(45).x, at(45).y);
    close(snapTo15(start, at(50)), at(45).x, at(45).y);
    close(snapTo15(start, at(37)), at(30).x, at(30).y);
    close(snapTo15(start, at(-7)), at(0).x, at(0).y);
    close(snapTo15(start, at(175)), at(180).x, at(180).y);
    close(snapTo15(start, at(171)), at(165).x, at(165).y);
    // Exact steps stay put.
    close(snapTo15(start, at(15)), at(15).x, at(15).y);
    close(snapTo15(start, at(120)), at(120).x, at(120).y);
    // No drag, no change.
    close(snapTo15(start, start), 100, 100);
  });

  it("treats a drag under four page px as a click", () => {
    expect(DEAD_ZONE_PX).toBe(4);
    expect(isDrag({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(isDrag({ x: 0, y: 0 }, { x: 0, y: -5 })).toBe(true);
  });

  it("converts page px to scene px by the page's zoom", () => {
    expect(toScene({ x: 60, y: 300 }, { x: 260, y: 300 }, 1)).toEqual({
      x: 60,
      y: 300,
      dx: 200,
      dy: 0,
    });
    const line = toScene({ x: 60, y: 300 }, { x: 260, y: 200 }, 0.5);
    expect(line).toEqual({ x: 120, y: 600, dx: 400, dy: -200 });
    const zoomed = toScene({ x: 45, y: 90 }, { x: 45, y: 180 }, 1.5);
    expect(zoomed.x).toBeCloseTo(30);
    expect(zoomed.y).toBeCloseTo(60);
    expect(zoomed.dx).toBeCloseTo(0);
    expect(zoomed.dy).toBeCloseTo(60);
  });

  it("cycles the element round robin from the line", () => {
    expect(QUICK_ELEMENTS).toEqual(["line", "rectangle", "ellipse", "arrow"]);
    expect(nextElement("line")).toBe("rectangle");
    expect(nextElement("rectangle")).toBe("ellipse");
    expect(nextElement("ellipse")).toBe("arrow");
    expect(nextElement("arrow")).toBe("line");
  });

  it("takes a rectangle's or ellipse's box from the drag, whichever way it went", () => {
    expect(boxOf({ x: 10, y: 20 }, { x: 110, y: 70 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    expect(boxOf({ x: 110, y: 70 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    expect(boxOf({ x: 10, y: 70 }, { x: 110, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    expect(boxOf({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });

  it("draws a box once it clears the dead zone in either direction", () => {
    expect(isBoxDrag({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false);
    expect(isBoxDrag({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(isBoxDrag({ x: 0, y: 0 }, { x: 0, y: -4 })).toBe(true);
    expect(isBoxDrag({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(true);
  });

  it("converts a box to scene px by the zoom", () => {
    expect(toSceneBox({ x: 60, y: 30 }, { x: 160, y: 80 }, 0.5)).toEqual({
      x: 120,
      y: 60,
      width: 200,
      height: 100,
    });
    expect(toSceneBox({ x: 160, y: 80 }, { x: 60, y: 30 }, 1)).toEqual({
      x: 60,
      y: 30,
      width: 100,
      height: 50,
    });
  });
});
