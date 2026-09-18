// A page's side and its spread, derived from its position and never stored. Page 1 is a
// right-hand page (recto), so the spreads are (inside cover | 1), (2 | 3), (4 | 5) and
// so on, the way a notebook lies open.

export type PageSide = "left" | "right";

/** The side of the page at `index` (0-based): odd page numbers are right-hand pages. */
export function pageSide(index: number): PageSide {
  return index % 2 === 0 ? "right" : "left";
}

export interface Spread {
  /** Index of the left-hand page, or null for the inside of the front cover. */
  left: number | null;
  /** Index of the right-hand page, or null for the inside of the back cover. */
  right: number | null;
}

/** The spread the page at `index` belongs to, in a notebook of `count` pages. */
export function spreadOf(index: number, count: number): Spread {
  const right = pageSide(index) === "right" ? index : index + 1;
  return { left: right > 0 ? right - 1 : null, right: right < count ? right : null };
}
