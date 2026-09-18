import { describe, expect, it } from "vitest";
import { INK_COLORS, inkColorOf } from "./palette";

describe("inkColorOf", () => {
  it("reads palette colours as hex, short hex or rgb()", () => {
    expect(inkColorOf("#e03131")).toBe("#e03131");
    expect(inkColorOf("#E03131")).toBe("#e03131");
    expect(inkColorOf("rgb(224, 49, 49)")).toBe("#e03131");
    expect(inkColorOf("rgb(224 49 49)")).toBe("#e03131");
    expect(inkColorOf("rgba(25, 113, 194, 1)")).toBe("#1971c2");
    for (const color of INK_COLORS) {
      if (color.value) expect(inkColorOf(color.value)).toBe(color.value);
    }
  });

  it("rejects colours outside the palette", () => {
    expect(inkColorOf("#123456")).toBeNull();
    expect(inkColorOf("rgb(0, 0, 0)")).toBeNull();
    expect(inkColorOf("red")).toBeNull();
    expect(inkColorOf("")).toBeNull();
  });
});
