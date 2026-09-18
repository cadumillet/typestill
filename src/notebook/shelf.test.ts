import { describe, expect, it } from "vitest";
import { COVER_COLORS } from "./cover";
import { describeOpened, leastUsedColor } from "./Shelf";

describe("shelf", () => {
  it("describes when a notebook was last opened", () => {
    const now = new Date(2026, 8, 18, 12).getTime();
    expect(describeOpened(now - 1000, now)).toBe("Opened today");
    expect(describeOpened(now - 86_400_000, now)).toBe("Opened yesterday");
    expect(describeOpened(now - 3 * 86_400_000, now)).toBe("Opened 3 days ago");
    expect(describeOpened(new Date(2026, 6, 2).getTime(), now)).toMatch(/July/);
  });

  it("gives a new notebook the palette colour fewest notebooks wear", () => {
    expect(leastUsedColor([])).toBe(COVER_COLORS[0].value);
    expect(leastUsedColor([{ cover: { color: COVER_COLORS[0].value } }])).toBe(
      COVER_COLORS[1].value,
    );
  });
});
