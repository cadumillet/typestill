import { describe, expect, it } from "vitest";
import { columnFromText } from "../page/document";
import type { Zine } from "../page/zine";
import { fillShade, pageFill, textFill, zineFill } from "./fill";

describe("textFill", () => {
  it("sums the columns' lines over the lines available", () => {
    expect(textFill([5], 20)).toBe(0.25);
    expect(textFill([5, 15], 20)).toBe(0.5);
    expect(textFill([], 20)).toBe(0);
  });

  it("never passes 1, whatever the mirror measured", () => {
    expect(textFill([25], 20)).toBe(1);
  });
});

describe("pageFill", () => {
  it("counts a drawing as at least a quarter", () => {
    expect(pageFill(0, true)).toBe(0.25);
    expect(pageFill(0.1, true)).toBe(0.25);
    expect(pageFill(0.6, true)).toBe(0.6);
    expect(pageFill(0, false)).toBe(0);
  });
});

describe("zineFill", () => {
  const zine = (rows: Zine["rows"]): Zine => ({ padding: 0, rows });

  it("is 0 with no rows", () => {
    expect(zineFill(zine([]))).toBe(0);
  });

  it("counts filled cells and written text blocks over those present", () => {
    const half = zine([
      {
        blocks: [
          { kind: "grid", layout: "row", images: [{ fileId: "f", fit: "cover" }, null] },
          { kind: "text", column: columnFromText(""), rows: 4 },
        ],
      },
      { blocks: [{ kind: "text", column: columnFromText("caption"), rows: 4 }] },
    ]);
    expect(zineFill(half)).toBe(0.5);
    expect(zineFill(zine([{ blocks: [{ kind: "image", image: null }] }]))).toBe(0);
  });
});

describe("fillShade", () => {
  it("steps through grey, light, medium and full", () => {
    expect(fillShade(0)).toBe("empty");
    expect(fillShade(0.2)).toBe("light");
    expect(fillShade(1 / 3)).toBe("light");
    expect(fillShade(0.5)).toBe("medium");
    expect(fillShade(0.9)).toBe("full");
    expect(fillShade(1)).toBe("full");
  });
});
