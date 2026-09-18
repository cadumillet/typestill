// The notebook as a sequence of sides, derived from the sections and the ordered pages
// and never stored: the inside of the front cover; for each section its divider leaf
// (front and back) and its pages, with a blank back when the section ends on a
// right-hand side; the inside of the back cover last. Sides alternate left and right
// from the inside cover (side 0, a left-hand side), so a divider's front and every
// section's first page are right-hand sides, page 1 is a right-hand page, and the
// spreads run (inside cover | divider), (divider back | 1), (2 | 3) and so on.

export type PageSide = "left" | "right";

/** What a section looks like to the sides: the sequence needs its identity and its look. */
export interface SideSection {
  id: string;
  name: string;
  color: string;
}

export type Side =
  /** The inside of a cover: a slab in the cover colour, nothing to click. */
  | { kind: "cover"; cover: "front" | "back" }
  /** A section's divider leaf: a slab in the section's colour, its name on the front. */
  | { kind: "divider"; face: "front" | "back"; section: SideSection }
  /** A page, by its index in the ordered pages; its number is that index plus one. */
  | { kind: "page"; index: number }
  /** The blank back of a section's last leaf: empty paper, nothing to click. */
  | { kind: "blank"; section: SideSection };

/** The side at an index of the sequence: even indexes are left-hand sides. */
export function sideAt(index: number): PageSide {
  return index % 2 === 0 ? "left" : "right";
}

/**
 * The notebook's sides in order. `pages` must already be in notebook order (section
 * order, then creation order): each section's pages follow its divider. The sequence
 * always has an even length, the inside of the back cover being a right-hand side.
 */
export function sideSequence(
  sections: readonly SideSection[],
  pages: readonly { sectionId: string }[],
): Side[] {
  const sides: Side[] = [{ kind: "cover", cover: "front" }];
  for (const section of sections) {
    sides.push({ kind: "divider", face: "front", section });
    sides.push({ kind: "divider", face: "back", section });
    pages.forEach((page, index) => {
      if (page.sectionId === section.id) sides.push({ kind: "page", index });
    });
    // A section ending on a right-hand page gets the blank back of that leaf, so the
    // next divider's front (or the inside of the back cover) is a right-hand side again.
    if (sideAt(sides.length - 1) === "right") sides.push({ kind: "blank", section });
  }
  sides.push({ kind: "cover", cover: "back" });
  return sides;
}

/** The index in the sequence of the page at `pageIndex`, or -1. */
export function sideIndexOfPage(sides: readonly Side[], pageIndex: number): number {
  return sides.findIndex((side) => side.kind === "page" && side.index === pageIndex);
}

/** The side of the page at `pageIndex`: right for page 1 and every section's first page. */
export function pageSide(sides: readonly Side[], pageIndex: number): PageSide {
  return sideAt(sideIndexOfPage(sides, pageIndex));
}

/** The two sides of the spread the side at `index` belongs to: a left-hand and a right-hand side. */
export function spreadOf(sides: readonly Side[], index: number): [Side, Side] {
  const left = index - (index % 2);
  return [sides[left], sides[left + 1]];
}
