// The backup file: one notebook as JSON, images inlined as data URLs.
//
// Versions: 1 had plain-string columns; 2 (text formatting) has { text, doc } columns;
// 3 (notebook cover) adds the cover; 4 (zine pages) adds the page kind and the zine
// block; 5 (themes) adds the notebook's theme id; 6 (zine blocks) stores zine pages as
// rows of blocks and drops the date stamp fields; 7 (highlight) lets documents carry the
// highlight mark; 8 (drawing on the page) adds each page's drawing and its layer; 9
// (sections) replaces the notebook's tags with sections and a page's tag with its
// section; 10 (a notebook of fixed size) gives the notebook its size and each section
// its start, and makes pages slots with a position and a fill in place of a section.
// Older files are still read: version 1 columns are converted, each line break becoming
// a paragraph boundary, a missing cover is the default one, a page without a kind is
// lined, a missing theme is Ruled, a zine page of the old shape is converted losslessly
// (see zineLegacy.ts), a page without a drawing gets an empty one, over the text, tags
// become sections (see sectionsFromTags in sections.ts), the untagged pages in a first
// section named Notes, and sections of named pages become cuts over slots (see
// slotsFromSections there), each padded to whole sheets with blank pages.

import { DEFAULT_COVER, isCover } from "../notebook/cover";
import {
  sectionsFromTags,
  slotsFromSections,
  validateSections,
  type LegacyPage,
  type LegacySection,
  type LegacyTag,
} from "../notebook/sections";
import { columnFromText, isColumn } from "../page/document";
import { DEFAULT_MARGIN_MM, PAGE_SIZES_MM } from "../page/paper";
import { isZine, type Zine } from "../page/zine";
import { convertLegacyZine, isLegacyZine } from "../page/zineLegacy";
import { DEFAULT_THEME_ID } from "../theme/themes";
import { SHEET, type Column, type NotebookDocument, type Page, type Section } from "./model";

export const BACKUP_FORMAT = "typestill-notebook";
// Version 10 made the notebook one of fixed size (Phase 10): it carries `size`, each
// section a `start` and each page a `position` and a `fill`; older files' sections of
// named pages are converted on read.
export const BACKUP_VERSION = 10;
const READABLE_VERSIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  notebook: NotebookDocument;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

export function serializeBackup(notebook: NotebookDocument, exportedAt = Date.now()): string {
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, notebook };
  return JSON.stringify(file);
}

/** Suggested file name, e.g. "field-notes-2026-09-17.typestill.json". */
export function backupFileName(notebook: Pick<NotebookDocument, "name">, at = new Date()): string {
  const slug =
    notebook.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "notebook";
  return `${slug}-${at.toISOString().slice(0, 10)}.typestill.json`;
}

const ORIENTATIONS = new Set(["portrait", "landscape"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumberOrNull = (value: unknown): value is number | null =>
  value === null || typeof value === "number";

const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isLegacyTag = (value: unknown): value is LegacyTag =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.color === "string";

const isLegacySection = (value: unknown): value is LegacySection =>
  isRecord(value) &&
  typeof value.id === "string" &&
  value.id.length > 0 &&
  typeof value.name === "string" &&
  typeof value.color === "string" &&
  isStringOrNull(value.lastPageId);

const isSection = (value: unknown): value is Section =>
  isLegacySection(value) && typeof (value as { start?: unknown }).start === "number";

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new BackupError(message);
}

/**
 * Parses and validates a backup. Checks the envelope and the notebook's own fields;
 * element shapes are Excalidraw's and are sanitised by restoreElements when loaded.
 */
export function parseBackup(text: string): NotebookDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("Not a JSON file");
  }
  expect(isRecord(raw), "Not a typestill backup");
  expect(raw.format === BACKUP_FORMAT, "Not a typestill backup");
  expect(
    typeof raw.version === "number" && READABLE_VERSIONS.has(raw.version),
    `Backup version ${String(raw.version)} is not supported (expected ${BACKUP_VERSION})`,
  );
  const version = raw.version;
  const nb = raw.notebook;
  expect(isRecord(nb), "Backup has no notebook");
  expect(typeof nb.id === "string" && nb.id.length > 0, "Notebook has no id");
  expect(typeof nb.name === "string", "Notebook has no name");
  expect(typeof nb.createdAt === "number", "Notebook has no createdAt");
  expect(typeof nb.pageSize === "string" && nb.pageSize in PAGE_SIZES_MM, "Unknown page size");
  expect(
    typeof nb.orientation === "string" && ORIENTATIONS.has(nb.orientation),
    "Unknown orientation",
  );
  expect(nb.cover === undefined || isCover(nb.cover), "Invalid cover");
  expect(
    nb.themeId === undefined || (typeof nb.themeId === "string" && nb.themeId.length > 0),
    "Invalid theme",
  );
  expect(isRecord(nb.defaults) && isNumberOrNull(nb.defaults.divider), "Invalid defaults");
  const cover = isCover(nb.cover) ? nb.cover : { ...DEFAULT_COVER };
  // Files from before version 9 hold tags, which become sections of named pages; version
  // 9 holds those sections itself, at least one, every page naming one of them; version
  // 10 holds the size and the sections as cuts, valid against it, and pages as slots.
  let legacySections: LegacySection[] | undefined;
  let sectionIdOf: (page: { tagId?: string | null; sectionId?: string }) => string = (page) =>
    page.sectionId as string;
  let size = 0;
  if (version < 9) {
    expect(Array.isArray(nb.tags) && nb.tags.every(isLegacyTag), "Invalid tags");
    ({ sections: legacySections, sectionIdOf } = sectionsFromTags({ cover, tags: nb.tags }));
  } else if (version < 10) {
    expect(
      Array.isArray(nb.sections) && nb.sections.length >= 1 && nb.sections.every(isLegacySection),
      "Invalid sections",
    );
    legacySections = nb.sections;
  } else {
    expect(
      typeof nb.size === "number" &&
        Number.isInteger(nb.size) &&
        nb.size > 0 &&
        nb.size % SHEET === 0,
      "Invalid size",
    );
    size = nb.size;
    expect(
      Array.isArray(nb.sections) && nb.sections.length >= 1 && nb.sections.every(isSection),
      "Invalid sections",
    );
    try {
      validateSections(nb.sections, size);
    } catch (error) {
      throw new BackupError(`Invalid sections: ${(error as Error).message}`);
    }
  }
  const sectionIds = new Set((legacySections ?? []).map((section) => section.id));
  expect(isRecord(nb.files), "Invalid files");
  expect(Array.isArray(nb.pages), "Invalid pages");
  expect(version < 10 || nb.pages.length === size, "Page count does not match the size");
  const positions = new Set<number>();
  for (const page of nb.pages) {
    expect(isRecord(page), "Invalid page");
    expect(typeof page.id === "string" && page.id.length > 0, "Page has no id");
    expect(typeof page.createdAt === "number", "Page has no createdAt");
    // Before version 9 a page carried a tag or none (the oldest files have no field at
    // all); version 9 named its section; from version 10 it holds its slot and its fill.
    if (version < 9) {
      expect(page.tagId === undefined || isStringOrNull(page.tagId), "Page has an invalid tag");
    } else if (version < 10) {
      expect(
        typeof page.sectionId === "string" && sectionIds.has(page.sectionId),
        "Page has an invalid section",
      );
    } else {
      expect(page.sectionId === undefined, "Page names a section");
      expect(
        typeof page.position === "number" &&
          Number.isInteger(page.position) &&
          page.position >= 0 &&
          page.position < size,
        "Page has an invalid position",
      );
      expect(!positions.has(page.position), "Two pages share a position");
      positions.add(page.position);
      expect(
        typeof page.fill === "number" && page.fill >= 0 && page.fill <= 1,
        "Page has an invalid fill",
      );
    }
    expect(
      page.kind === undefined || page.kind === "lined" || page.kind === "zine",
      "Page has an invalid kind",
    );
    const zine = page.kind === "zine";
    expect(
      !zine || (version < 6 ? isLegacyZine(page.zine) : isZine(page.zine)),
      "Page has an invalid zine block",
    );
    expect(
      Array.isArray(page.columns) &&
        (zine
          ? page.columns.length === 0
          : page.columns.length >= 1 &&
            page.columns.length <= 2 &&
            page.columns.every(version === 1 ? (column) => typeof column === "string" : isColumn)),
      "Page has invalid columns",
    );
    expect(isNumberOrNull(page.divider), "Page has an invalid divider");
    expect(
      page.margin === undefined || typeof page.margin === "number",
      "Page has an invalid margin",
    );
    // The drawing's element shapes are Excalidraw's, sanitised by restoreElements when
    // loaded, like the canvas's.
    expect(version < 8 || Array.isArray(page.drawing), "Page has an invalid drawing");
    expect(
      version < 8 || page.drawingLayer === "over" || page.drawingLayer === "under",
      "Page has an invalid drawing layer",
    );
    expect(
      page.canvasView === null ||
        (isRecord(page.canvasView) &&
          typeof page.canvasView.scrollX === "number" &&
          typeof page.canvasView.scrollY === "number" &&
          typeof page.canvasView.zoom === "number"),
      "Page has an invalid canvas view",
    );
  }
  const canvas = nb.canvas;
  expect(isRecord(canvas) && Array.isArray(canvas.elements), "Invalid canvas");
  const defaults = nb.defaults as Record<string, unknown>;
  // The tags of versions before 9 are dropped: the sections stand in for them.
  const doc = { ...nb } as unknown as NotebookDocument & { tags?: unknown };
  delete doc.tags;
  // The date stamp fields of versions 2 to 5 are dropped: the page has no date stamp.
  const restDefaults = { ...doc.defaults } as NotebookDocument["defaults"] & { showDate?: unknown };
  delete restDefaults.showDate;
  const themeId = typeof nb.themeId === "string" ? nb.themeId : DEFAULT_THEME_ID;
  const fullDefaults = {
    ...restDefaults,
    showPageNumber: defaults.showPageNumber !== false,
    margin: typeof defaults.margin === "number" ? defaults.margin : DEFAULT_MARGIN_MM,
  };
  // Each page as version 10 holds it, but for its slot: a file from before version 10
  // still names the page's section here, and the converter below turns that into slots.
  const pages = doc.pages.map((raw) => {
    const page = { ...raw } as Page & { showDate?: unknown; tagId?: unknown };
    delete page.showDate;
    delete page.tagId;
    const converted: Page = {
      ...page,
      kind: page.kind ?? "lined",
      showPageNumber: page.showPageNumber !== false,
      margin: typeof page.margin === "number" ? page.margin : DEFAULT_MARGIN_MM,
      columns: (page.columns as (string | Column)[]).map((column) =>
        typeof column === "string" ? columnFromText(column) : column,
      ),
      // Pages from before version 8 have no drawing.
      drawing: version < 8 ? [] : page.drawing,
      drawingLayer: version < 8 ? "over" : page.drawingLayer,
    };
    if (converted.kind === "zine") {
      const zine = page.zine as unknown;
      converted.zine = (version < 6 ? convertLegacyZine(zine as never) : zine) as Zine;
    }
    return converted;
  });
  let slots: { size: number; sections: Section[]; pages: Page[] };
  if (legacySections) {
    slots = slotsFromSections(
      { id: nb.id, defaults: fullDefaults, themeId, sections: legacySections },
      pages.map((page, i): LegacyPage => ({
        ...page,
        sectionId: sectionIdOf(doc.pages[i] as { tagId?: string | null; sectionId?: string }),
      })),
    );
  } else {
    // A section left at a page the file no longer holds is unvisited, so the file stays usable.
    const pageIds = new Set(pages.map((page) => page.id));
    slots = {
      size,
      sections: (nb.sections as Section[]).map((section) =>
        section.lastPageId !== null && !pageIds.has(section.lastPageId)
          ? { ...section, lastPageId: null }
          : section,
      ),
      pages,
    };
  }
  return {
    ...doc,
    lastOpenedAt: typeof nb.lastOpenedAt === "number" ? nb.lastOpenedAt : nb.createdAt,
    lastPageId: typeof nb.lastPageId === "string" ? nb.lastPageId : null,
    cover,
    themeId,
    defaults: fullDefaults,
    ...slots,
    canvas: {
      notebookId: nb.id,
      gridEnabled: canvas.gridEnabled !== false,
      elements: canvas.elements,
    },
  };
}
