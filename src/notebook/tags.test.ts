import { describe, expect, it } from "vitest";
import { TAG_COLORS, nextTagColor, passesFilter, tagOf } from "./tags";

const tag = (id: string, color: string) => ({ id, name: id, color });

describe("tags", () => {
  it("hands out palette colours, least used first", () => {
    expect(nextTagColor([])).toBe(TAG_COLORS[0].value);
    expect(nextTagColor([tag("a", TAG_COLORS[0].value)])).toBe(TAG_COLORS[1].value);
    const all = TAG_COLORS.map((color, i) => tag(String(i), color.value));
    expect(nextTagColor(all)).toBe(TAG_COLORS[0].value);
    expect(nextTagColor([...all, tag("x", TAG_COLORS[0].value)])).toBe(TAG_COLORS[1].value);
  });

  it("looks a page's tag up and applies the filter", () => {
    const tags = [tag("a", "#111"), tag("b", "#222")];
    expect(tagOf({ tagId: "b" }, tags)?.color).toBe("#222");
    expect(tagOf({ tagId: "gone" }, tags)).toBeUndefined();
    expect(tagOf({ tagId: null }, tags)).toBeUndefined();
    expect(passesFilter({ tagId: "a" }, null)).toBe(true);
    expect(passesFilter({ tagId: "a" }, "a")).toBe(true);
    expect(passesFilter({ tagId: "b" }, "a")).toBe(false);
    expect(passesFilter({ tagId: null }, "a")).toBe(false);
  });
});
