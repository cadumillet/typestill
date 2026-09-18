// Section helpers. Sections are the notebook's divisions, defined at notebook level, and
// every page is in one: section order, then creation order, is the order of the pages,
// and the section's colour is what colours the page's square in the rail. The palette
// is the cover palette.

import { newId, type Page, type Section } from "../store/model";
import { COVER_COLORS } from "./cover";

export const SECTION_COLORS = COVER_COLORS;
export const NEW_SECTION_VALUE = "__new__";
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

/** The section a page is in, if it still exists. */
export function sectionOf(
  page: Pick<Page, "sectionId">,
  sections: readonly Section[],
): Section | undefined {
  return sections.find((section) => section.id === page.sectionId);
}

/**
 * The pages in notebook order: section order first, then createdAt within a section. A
 * page whose section is unknown (which should not happen) sorts after every known
 * section, still by createdAt. Does not mutate.
 */
export function pagesInOrder<P extends Pick<Page, "sectionId" | "createdAt">>(
  sections: readonly Section[],
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

/** One section's contiguous run of pages in the notebook order: the rail's column. */
export interface SectionRun<P = Page> {
  section: Section;
  /** The index in the ordered pages of the run's first page, or where it would be. */
  start: number;
  pages: P[];
}

/**
 * One run per section, in order, over pages already in notebook order (pagesInOrder).
 * An empty section has an empty run, its start where its first page would go.
 */
export function sectionRuns<P extends Pick<Page, "sectionId">>(
  sections: readonly Section[],
  orderedPages: readonly P[],
): SectionRun<P>[] {
  const runs: SectionRun<P>[] = [];
  let start = 0;
  for (const section of sections) {
    const pages = orderedPages.filter((page) => page.sectionId === section.id);
    runs.push({ section, start, pages });
    start += pages.length;
  }
  return runs;
}

/** A tag as the formats before backup version 9 and Dexie version 10 stored it. */
export interface LegacyTag {
  id: string;
  name: string;
  color: string;
}

/**
 * A notebook's tags as sections, for the backup parser and the Dexie upgrade: a first
 * section, Notes, in the cover's colour takes the untagged pages, then one section per
 * tag in the tags' order keeps the tag's id (so nothing else needs remapping), name and
 * colour. Every section starts unvisited. `sectionIdOf` gives a page's section from its
 * tag: the tag's, when it names one of the tags, else Notes.
 */
export function sectionsFromTags(notebook: {
  cover: { color: string };
  tags: readonly LegacyTag[];
}): { sections: Section[]; sectionIdOf: (page: { tagId?: string | null }) => string } {
  const notes: Section = {
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
