// How full a page is, 0 to 1, kept on the page so the grid view can shade it without
// rendering anything (PLAN.md section 5, "Fill"). Lined pages: the lines the text takes
// over the lines available, summed over the columns, reported by the columns' capacity
// measurement; a page with a drawing and no text is at least a quarter full. Zine pages:
// the cells filled and the text blocks written over the cells and blocks present.

import { hasWriting, isMediaBlock, mediaCells, type Zine } from "../page/zine";

/** What a drawing alone counts for. */
const DRAWN_FILL = 0.25;

/** A lined page's fill from its columns' used lines and the lines each column has. */
export function textFill(usedLines: readonly number[], linesPerColumn: number): number {
  const available = linesPerColumn * usedLines.length;
  if (available <= 0) return 0;
  const used = usedLines.reduce((sum, lines) => sum + lines, 0);
  return Math.min(1, Math.max(0, used / available));
}

/** A page's fill: its text (or blocks), and at least a quarter when only drawn on. */
export function pageFill(contentFill: number, hasDrawing: boolean): number {
  return hasDrawing ? Math.max(contentFill, DRAWN_FILL) : contentFill;
}

/** A zine page's fill: filled cells and written text blocks over those present; 0 with no rows. */
export function zineFill(zine: Zine): number {
  let present = 0;
  let filled = 0;
  for (const row of zine.rows) {
    for (const block of row.blocks) {
      if (isMediaBlock(block)) {
        for (const cell of mediaCells(block)) {
          present += 1;
          if (cell) filled += 1;
        }
      } else {
        present += 1;
        if (hasWriting(block)) filled += 1;
      }
    }
  }
  return present === 0 ? 0 : filled / present;
}

export type FillShade = "empty" | "light" | "medium" | "full";

/** The grid's shade for a fill: grey when empty, then a light, a medium and the full tint. */
export function fillShade(fill: number): FillShade {
  if (fill <= 0) return "empty";
  if (fill <= 1 / 3) return "light";
  if (fill <= 2 / 3) return "medium";
  return "full";
}
