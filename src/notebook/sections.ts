// Section helpers. Sections are cuts: each starts at a sheet boundary (a multiple of
// SHEET) and runs to the next cut or the end of the notebook, so a page's section follows
// from its position and nothing is stored on the page. The first cut is at 0 and cannot
// move or go. Editing a cut edits the notebook's `sections` array alone; no page changes.
// The palette is the cover palette. The converter at the end turns the Phase 7 shape
// (pages naming a section) into slots.

import {
  NOTEBOOK_SIZES,
  SHEET,
  blankPage,
  isPageBlank,
  newId,
  type Notebook,
  type Page,
  type Section,
} from "../store/model";
import { COVER_COLORS } from "./cover";

export const SECTION_COLORS = COVER_COLORS;
/** The name of a notebook's first section, and of the one converted tags leave the untagged pages in. */
export const DEFAULT_SECTION_NAME = "Notes";

/** The first palette colour no section uses yet, else the least used one. */
export function nextSectionColor(sections: readonly Section[]): string {
  const counts = new Map(SECTION_COLORS.map((color) => [color.value, 0]));
  for (const section of sections) counts.set(section.color, (counts.get(section.color) ?? 0) + 1);
  let best = SECTION_COLORS[0].value;
  let fewest = Infinity;
  for (const color of SECTION_COLORS) {
    const count = counts.get(color.value) ?? 0;
    if (count < fewest) {
      fewest = count;
      best = color.value;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Reading the cuts

/**
 * The index of the section a position is in: the last one whose start is at or below
 * it, over sections in start order. A position before the first start (which cannot
 * happen, the first start being 0) is in the first section.
 */
export function sectionIndexOf(sections: readonly Section[], position: number): number {
  let index = 0;
  for (let i = 1; i < sections.length; i++) if (sections[i].start <= position) index = i;
  return index;
}

/** The section a position is in. */
export function sectionOf(sections: readonly Section[], position: number): Section {
  return sections[sectionIndexOf(sections, position)];
}

/** The positions of section `index`'s pages: from its start to the next start, or the size. */
export function sectionRange(
  sections: readonly Section[],
  size: number,
  index: number,
): { start: number; end: number } {
  return { start: sections[index].start, end: sections[index + 1]?.start ?? size };
}

/** The smallest multiple of SHEET at or above `n`. */
export function padToSheet(n: number): number {
  return Math.ceil(n / SHEET) * SHEET;
}

/**
 * The size for `total` pages: the smallest of NOTEBOOK_SIZES that holds them, or the
 * total itself rounded up to whole sheets when it is larger than the largest.
 */
export function sizeFor(total: number): number {
  return NOTEBOOK_SIZES.find((size) => size >= total) ?? padToSheet(total);
}

/**
 * Throws, naming the rule broken, unless the sections are valid cuts of a notebook of
 * `size` pages: the size a positive multiple of SHEET; at least one section; the first
 * starting at 0; every start a multiple of SHEET, strictly increasing and below the size.
 */
export function validateSections(sections: readonly Section[], size: number): void {
  if (!(size > 0 && size % SHEET === 0)) {
    throw new Error(`The size must be a positive multiple of ${SHEET}, not ${size}`);
  }
  if (sections.length === 0) throw new Error("A notebook keeps at least one section");
  if (sections[0].start !== 0) throw new Error("The first section must start at 0");
  for (let i = 0; i < sections.length; i++) {
    const { start } = sections[i];
    if (start % SHEET !== 0) {
      throw new Error(`A section must start at a multiple of ${SHEET}, not ${start}`);
    }
    if (i > 0 && start <= sections[i - 1].start) {
      throw new Error("Sections must start at strictly increasing positions");
    }
    if (start >= size) throw new Error(`A section cannot start at ${start}, past the end`);
  }
}

// ---------------------------------------------------------------------------
// Editing the cuts. Each returns a new array in start order and leaves the input alone.

function inStartOrder(sections: readonly Section[]): Section[] {
  return [...sections].sort((a, b) => a.start - b.start);
}

/**
 * A new, unvisited section cut at `start`. Throws for a start of 0 (the first section
 * is already there), one off a sheet boundary, or one another section already starts at.
 */
export function cut(
  sections: readonly Section[],
  start: number,
  name: string,
  color: string,
): Section[] {
  if (start === 0) throw new Error("The first section cannot be cut again");
  if (start % SHEET !== 0) throw new Error(`A cut must fall at a multiple of ${SHEET}`);
  if (sections.some((section) => section.start === start)) {
    throw new Error(`A section already starts at ${start}`);
  }
  return inStartOrder([...sections, { id: newId(), name, color, start, lastPageId: null }]);
}

/**
 * Section `index` moved to `start`: a multiple of SHEET strictly between its neighbours'
 * starts, so the order is kept and no section empties. Throws for the first section,
 * which cannot move, and for a start off a boundary or outside the neighbours.
 */
export function moveCut(sections: readonly Section[], index: number, start: number): Section[] {
  if (index === 0) throw new Error("The first section cannot move");
  const section = sections[index];
  if (!section) throw new Error(`No section at index ${index}`);
  if (start % SHEET !== 0) throw new Error(`A cut must fall at a multiple of ${SHEET}`);
  const before = sections[index - 1].start;
  const after = sections[index + 1]?.start ?? Infinity;
  if (!(start > before && start < after)) {
    throw new Error(`A cut at ${start} would cross the section next to it`);
  }
  return sections.map((s, i) => (i === index ? { ...s, start } : s));
}

/**
 * The sections without section `index`: its pages fall to the section before it, which
 * now runs to the next cut. Throws for the first section, which cannot go.
 */
export function removeCut(sections: readonly Section[], index: number): Section[] {
  if (index === 0) throw new Error("The first section cannot be removed");
  if (!sections[index]) throw new Error(`No section at index ${index}`);
  return sections.filter((_, i) => i !== index);
}

// ---------------------------------------------------------------------------
// Converting the Phase 7 shape (backup versions 9 and below, Dexie versions 10 and below)

/** A section as the formats before backup version 10 stored it: no start. */
export type LegacySection = Omit<Section, "start">;

/** A page as those formats stored it: in a named section, with no position or fill. */
export type LegacyPage = Omit<Page, "position" | "fill"> & { sectionId: string };

/**
 * The pages in Phase 7's notebook order: section order first, then createdAt within a
 * section. A page whose section is unknown (which should not happen) sorts after every
 * known section, still by createdAt. Does not mutate.
 */
function pagesInOrder<P extends Pick<Page, "createdAt"> & { sectionId: string }>(
  sections: readonly LegacySection[],
  pages: readonly P[],
): P[] {
  const rank = new Map(sections.map((section, i) => [section.id, i]));
  const unknown = sections.length;
  return [...pages].sort(
    (a, b) =>
      (rank.get(a.sectionId) ?? unknown) - (rank.get(b.sectionId) ?? unknown) ||
      a.createdAt - b.createdAt,
  );
}

/**
 * A notebook's sections and pages as slots and cuts, for the backup parser and the
 * Dexie upgrade. The pages keep their Phase 7 order (section order, then createdAt; a
 * page naming an unknown section goes at the end of the last one); each section's run
 * is padded at its end with blank lined pages from the notebook defaults to the next
 * whole sheet (a section with no pages gets one sheet, so it still exists); positions
 * follow that order and each section starts at its first; the size is `sizeFor` the
 * total, the slots left over being blank pages in the last section. A blank page's
 * createdAt is after every existing page's and after `now`, strictly increasing. The
 * fill is 0 for a blank page and 0.5 for one with something on it until it is measured.
 * A section left at a page that is gone is unvisited. Nothing is lost.
 */
export function slotsFromSections(
  notebook: Pick<Notebook, "id" | "defaults" | "themeId"> & { sections: readonly LegacySection[] },
  pages: readonly LegacyPage[],
  now = Date.now(),
): { size: number; sections: Section[]; pages: Page[] } {
  const { sections } = notebook;
  const rank = new Map(sections.map((section, i) => [section.id, i]));
  const last = sections.length - 1;
  const runs: LegacyPage[][] = sections.map(() => []);
  for (const page of pagesInOrder(sections, pages)) {
    runs[Math.min(rank.get(page.sectionId) ?? last, last)].push(page);
  }
  let createdAt = Math.max(now, ...pages.map((page) => page.createdAt + 1));
  const slots: Page[] = [];
  const blank = () => blankPage(notebook, slots.length, createdAt++);
  const starts: number[] = [];
  for (const run of runs) {
    starts.push(slots.length);
    for (const legacy of run) {
      const page = { ...legacy } as Page & { sectionId?: string };
      delete page.sectionId;
      slots.push({ ...page, position: slots.length, fill: isPageBlank(page) ? 0 : 0.5 });
    }
    const end = padToSheet(Math.max(run.length, 1)) + starts[starts.length - 1];
    while (slots.length < end) slots.push(blank());
  }
  const size = sizeFor(slots.length);
  while (slots.length < size) slots.push(blank());
  const pageIds = new Set(slots.map((page) => page.id));
  return {
    size,
    sections: sections.map((section, i) => ({
      ...section,
      start: starts[i],
      lastPageId:
        section.lastPageId !== null && pageIds.has(section.lastPageId) ? section.lastPageId : null,
    })),
    pages: slots,
  };
}

// ---------------------------------------------------------------------------
// Converting tags (backup versions 8 and below, Dexie versions 9 and below)

/** A tag as the formats before backup version 9 and Dexie version 10 stored it. */
export interface LegacyTag {
  id: string;
  name: string;
  color: string;
}

/**
 * A notebook's tags as Phase 7 sections, for the backup parser and the Dexie upgrade: a
 * first section, Notes, in the cover's colour takes the untagged pages, then one section
 * per tag in the tags' order keeps the tag's id (so nothing else needs remapping), name
 * and colour. Every section starts unvisited. `sectionIdOf` gives a page's section from
 * its tag: the tag's, when it names one of the tags, else Notes. The result is the
 * Phase 7 shape; `slotsFromSections` takes it the rest of the way.
 */
export function sectionsFromTags(notebook: {
  cover: { color: string };
  tags: readonly LegacyTag[];
}): { sections: LegacySection[]; sectionIdOf: (page: { tagId?: string | null }) => string } {
  const notes: LegacySection = {
    id: newId(),
    name: DEFAULT_SECTION_NAME,
    color: notebook.cover.color,
    lastPageId: null,
  };
  const sections = [
    notes,
    ...notebook.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      lastPageId: null,
    })),
  ];
  const known = new Set(notebook.tags.map((tag) => tag.id));
  return {
    sections,
    sectionIdOf: (page) =>
      typeof page.tagId === "string" && known.has(page.tagId) ? page.tagId : notes.id,
  };
}
