import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_ID, PLAIN, RULED, THEMES, getTheme } from "./themes";

describe("built-in themes", () => {
  it("has Ruled as the default and falls back to it", () => {
    expect(DEFAULT_THEME_ID).toBe("ruled");
    expect(getTheme("ruled")).toBe(RULED);
    expect(getTheme("plain")).toBe(PLAIN);
    expect(getTheme("gone")).toBe(RULED);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it("keeps the grid and the hard stop, whatever is drawn", () => {
    for (const theme of THEMES) {
      expect(theme.lined.pitchMm).toBeGreaterThan(0);
      expect(theme.lined.firstRuleMm).toBeGreaterThan(0);
      expect(theme.lined.font.lineHeight).toBeGreaterThan(0);
      expect(theme.zine.font.lineHeight).toBeGreaterThan(0);
      expect(theme.zine.defaultTextRows).toBeGreaterThan(0);
    }
    expect(RULED.lined.rules).toBe("lines");
    expect(RULED.lined.marginLine).toBe(true);
    expect(PLAIN.lined.rules).toBe("none");
    expect(PLAIN.lined.marginLine).toBe(false);
    expect(PLAIN.lined.pitchMm).toBe(RULED.lined.pitchMm);
  });
});
