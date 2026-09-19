import { describe, expect, it } from "vitest";
import { pageSide, spreadOf } from "./sides";

describe("page sides", () => {
  it("makes page 1 a right-hand page and alternates from there", () => {
    expect(pageSide(0)).toBe("right");
    expect(pageSide(1)).toBe("left");
    expect(pageSide(2)).toBe("right");
    expect(pageSide(3)).toBe("left");
  });

  it("makes every section's first page, on a sheet boundary, a right-hand page", () => {
    for (const start of [0, 4, 8, 92]) expect(pageSide(start)).toBe("right");
  });

  it("puts page 1 alone on the right of the first spread", () => {
    expect(spreadOf(0, 96)).toEqual({ left: null, right: 0 });
  });

  it("pairs an even page with the odd page after it", () => {
    expect(spreadOf(1, 96)).toEqual({ left: 1, right: 2 });
    expect(spreadOf(2, 96)).toEqual({ left: 1, right: 2 });
    expect(spreadOf(3, 96)).toEqual({ left: 3, right: 4 });
    expect(spreadOf(4, 96)).toEqual({ left: 3, right: 4 });
  });

  it("leaves the inside of the back cover after the last page", () => {
    expect(spreadOf(95, 96)).toEqual({ left: 95, right: null });
    expect(spreadOf(0, 1)).toEqual({ left: null, right: 0 });
  });
});
