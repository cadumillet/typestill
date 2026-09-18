import { describe, expect, it } from "vitest";
import { pageSide, sideAt, sideIndexOfPage, sideSequence, spreadOf, type Side } from "./sides";

const notes = { id: "s1", name: "Notes", color: "#111" };
const work = { id: "s2", name: "Work", color: "#222" };
const page = (sectionId: string) => ({ sectionId });

/** The sequence in short: c = cover, d = divider front, b = divider back, 1.. = pages, _ = blank. */
const shorthand = (sides: Side[]) =>
  sides
    .map((side) =>
      side.kind === "cover"
        ? "c"
        : side.kind === "divider"
          ? side.face === "front"
            ? "d"
            : "b"
          : side.kind === "blank"
            ? "_"
            : String(side.index + 1),
    )
    .join(" ");

describe("sideSequence", () => {
  it("opens with the inside cover, then each section's divider and pages, and closes with the back cover", () => {
    const sides = sideSequence([notes], [page("s1"), page("s1"), page("s1")]);
    expect(shorthand(sides)).toBe("c d b 1 2 3 _ c");
  });

  it("adds a blank back when a section ends on a right-hand side", () => {
    expect(shorthand(sideSequence([notes], [page("s1"), page("s1")]))).toBe("c d b 1 2 c");
    expect(shorthand(sideSequence([notes, work], [page("s1"), page("s1"), page("s2")]))).toBe(
      "c d b 1 2 d b 3 _ c",
    );
  });

  it("keeps an empty section's divider in its place", () => {
    expect(shorthand(sideSequence([work, notes], [page("s1")]))).toBe("c d b d b 1 _ c");
    expect(shorthand(sideSequence([notes, work], [page("s1")]))).toBe("c d b 1 _ d b c");
  });

  it("makes every section's first page a right-hand page and always ends on a right-hand side", () => {
    for (const pages of [
      [page("s1")],
      [page("s1"), page("s1")],
      [page("s1"), page("s2")],
      [page("s1"), page("s1"), page("s2"), page("s2"), page("s2")],
      [],
    ]) {
      const sides = sideSequence([notes, work], pages);
      expect(sides.length % 2).toBe(0);
      sides.forEach((side, i) => {
        if (side.kind === "divider" && side.face === "front") expect(sideAt(i)).toBe("right");
        if (
          side.kind === "page" &&
          (side.index === 0 || pages[side.index - 1].sectionId !== pages[side.index].sectionId)
        ) {
          expect(sideAt(i)).toBe("right");
        }
      });
    }
  });
});

describe("page sides and spreads", () => {
  const sides = sideSequence([notes, work], [page("s1"), page("s1"), page("s1"), page("s2")]);

  it("derives a page's side from its position", () => {
    expect(pageSide(sides, 0)).toBe("right");
    expect(pageSide(sides, 1)).toBe("left");
    expect(pageSide(sides, 2)).toBe("right");
    expect(pageSide(sides, 3)).toBe("right");
  });

  it("finds a page's side index", () => {
    expect(sideIndexOfPage(sides, 0)).toBe(3);
    expect(sideIndexOfPage(sides, 3)).toBe(9);
    expect(sideIndexOfPage(sides, 9)).toBe(-1);
  });

  it("pairs a left-hand side with the right-hand side after it", () => {
    expect(spreadOf(sides, 0)).toEqual([sides[0], sides[1]]);
    expect(spreadOf(sides, 1)).toEqual([sides[0], sides[1]]);
    expect(spreadOf(sides, 3)).toEqual([sides[2], sides[3]]);
    expect(spreadOf(sides, 4)).toEqual([sides[4], sides[5]]);
    expect(spreadOf(sides, 9)).toEqual([sides[8], sides[9]]);
    expect(sides[8]).toEqual({ kind: "divider", face: "back", section: work });
    expect(sides[10]).toEqual({ kind: "blank", section: work });
    expect(sides[11]).toEqual({ kind: "cover", cover: "back" });
  });
});
