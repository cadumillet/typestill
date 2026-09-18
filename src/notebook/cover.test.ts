import { describe, expect, it } from "vitest";
import {
  COVER_COLORS,
  DEFAULT_COVER,
  coverFromFields,
  coverMark,
  firstGrapheme,
  isCover,
} from "./cover";

describe("cover", () => {
  it("defaults to the first palette colour with no emoji or subtitle", () => {
    expect(DEFAULT_COVER).toEqual({ color: COVER_COLORS[0].value, emoji: null, subtitle: null });
    expect(new Set(COVER_COLORS.map((c) => c.value)).size).toBe(COVER_COLORS.length);
  });

  it("takes one user-perceived character, emoji sequences included", () => {
    expect(firstGrapheme("abc")).toBe("a");
    expect(firstGrapheme("  🧭 notes")).toBe("🧭");
    expect(firstGrapheme("👨‍👩‍👧x")).toBe("👨‍👩‍👧");
    expect(firstGrapheme("🇧🇷🇺🇸")).toBe("🇧🇷");
    expect(firstGrapheme("   ")).toBe("");
  });

  it("marks the cover with the emoji, else the name's initial", () => {
    expect(coverMark({ ...DEFAULT_COVER, emoji: "🌿" }, "Garden")).toBe("🌿");
    expect(coverMark(DEFAULT_COVER, "garden")).toBe("G");
    expect(coverMark(DEFAULT_COVER, "")).toBe("");
  });

  it("builds a cover from form fields, blank ones becoming null", () => {
    expect(coverFromFields({ color: "#123456", emoji: " ", subtitle: "  " })).toEqual({
      color: "#123456",
      emoji: null,
      subtitle: null,
    });
    expect(coverFromFields({ color: "#123456", emoji: "🌿🌿", subtitle: " Spring " })).toEqual({
      color: "#123456",
      emoji: "🌿",
      subtitle: "Spring",
    });
  });

  it("validates stored covers", () => {
    expect(isCover(DEFAULT_COVER)).toBe(true);
    expect(isCover({ color: "#fff", emoji: "🌿", subtitle: "x" })).toBe(true);
    expect(isCover(null)).toBe(false);
    expect(isCover({ color: "", emoji: null, subtitle: null })).toBe(false);
    expect(isCover({ color: "#fff", emoji: 1, subtitle: null })).toBe(false);
    expect(isCover({ color: "#fff", emoji: null })).toBe(false);
  });
});
