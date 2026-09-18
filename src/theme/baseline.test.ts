import { describe, expect, it } from "vitest";
import { FALLBACK_BASELINE, baselineFromMetrics } from "./baseline";

describe("baseline", () => {
  it("centres the content area in the line box", () => {
    // A font whose ascent equals its descent has its baseline at the middle.
    expect(baselineFromMetrics(10, 10, 30)).toBe(15);
    // Ascent 20, descent 5, line 30: content area 25, half-leading 2.5, baseline at 22.5.
    expect(baselineFromMetrics(20, 5, 30)).toBe(22.5);
    // Content taller than the line: negative half-leading, baseline still inside.
    expect(baselineFromMetrics(30, 10, 30)).toBe(25);
  });

  it("keeps the old ratio as the fallback until a font is measured", () => {
    expect(FALLBACK_BASELINE).toBe(0.7);
  });
});
