// The backup file: one notebook as JSON, images inlined as data URLs.
//
// Versions: 1 had plain-string columns; 2 (text formatting) has { text, doc } columns;
// 3 (notebook cover) adds the cover; 4 (zine pages) adds the page kind and the zine
// block; 5 (themes) adds the notebook's theme id; 6 (zine blocks) stores zine pages as
// rows of blocks and drops the date stamp fields; 7 (highlight) lets documents carry the
// highlight mark; 8 (drawing on the page) adds each page's drawing and its layer; 9
// (sections) replaces the notebook's tags with sections and a page's tag with its
// section. Older files are still read: version 1 columns are converted, each line break
// becoming a paragraph boundary, a missing cover is the default one, a page without a
// kind is lined, a missing theme is Ruled, a zine page of the old shape is converted
// losslessly (see zineLegacy.ts), a page without a drawing gets an empty one, over the
// text, and tags become sections (see sectionsFromTags in sections.ts), the untagged
// pages in a first section named Notes.

import { DEFAULT_COVER, isCover } from "../notebook/cover";
import { sectionsFromTags, type LegacyTag } from "../notebook/sections";
import { columnFromText, isColumn } from "../page/document";
import { DEFAULT_MARGIN_MM, PAGE_SIZES_MM } from "../page/paper";
import { isZine, type Zine } from "../page/zine";
import { convertLegacyZine, isLegacyZine } from "../page/zineLegacy";
import { DEFAULT_THEME_ID } from "../theme/themes";
import type { Column, NotebookDocument, Page, Section } from "./model";

export const BACKUP_FORMAT = "typestill-notebook";
// Version 9 turned tags into sections (Phase 7): the notebook carries `sections` and
// each page a `sectionId`; older files' tags are converted on read.
export const BACKUP_VERSION = 9;
const READABLE_VERSIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

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

const isSection = (value: unknown): value is Section =>
  isRecord(value) &&
  typeof value.id === "string" &&
  value.id.length > 0 &&
  typeof value.name === "string" &&
  typeof value.color === "string" &&
  isStringOrNull(value.lastPageId);

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
  // Files from before version 9 hold tags, which become sections; later ones hold the
  // sections themselves, at least one, and every page names one of them.
  let sections: Section[];
  let sectionIdOf: (page: { tagId?: string | null; sectionId?: string }) => string;
  if (version < 9) {
    expect(Array.isArray(nb.tags) && nb.tags.every(isLegacyTag), "Invalid tags");
    ({ sections, sectionIdOf } = sectionsFromTags({ cover, tags: nb.tags }));
  } else {
    expect(
      Array.isArray(nb.sections) && nb.sections.length >= 1 && nb.sections.every(isSection),
      "Invalid sections",
    );
    sections = nb.sections;
    sectionIdOf = (page) => page.sectionId as string;
  }
  const sectionIds = new Set(sections.map((section) => section.id));
  expect(isRecord(nb.files), "Invalid files");
  expect(Array.isArray(nb.pages), "Invalid pages");
  for (const page of nb.pages) {
    expect(isRecord(page), "Invalid page");
    expect(typeof page.id === "string" && page.id.length > 0, "Page has no id");
    expect(typeof page.createdAt === "number", "Page has no createdAt");
    // Before version 9 a page carried a tag or none; the oldest files have no field at all.
    expect(
      version < 9
        ? page.tagId === undefined || isStringOrNull(page.tagId)
        : typeof page.sectionId === "string" && sectionIds.has(page.sectionId),
      version < 9 ? "Page has an invalid tag" : "Page has an invalid section",
    );
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
  // A section left at a page the file no longer holds is unvisited, so the file stays usable.
  const pageIds = new Set(doc.pages.map((page) => page.id));
  return {
    ...doc,
    lastOpenedAt: typeof nb.lastOpenedAt === "number" ? nb.lastOpenedAt : nb.createdAt,
    lastPageId: typeof nb.lastPageId === "string" ? nb.lastPageId : null,
    cover,
    themeId: typeof nb.themeId === "string" ? nb.themeId : DEFAULT_THEME_ID,
    defaults: {
      ...restDefaults,
      showPageNumber: defaults.showPageNumber !== false,
      margin: typeof defaults.margin === "number" ? defaults.margin : DEFAULT_MARGIN_MM,
    },
    sections: sections.map((section) =>
      section.lastPageId !== null && !pageIds.has(section.lastPageId)
        ? { ...section, lastPageId: null }
        : section,
    ),
    pages: doc.pages.map((raw) => {
      const page = { ...raw } as Page & { showDate?: unknown; tagId?: unknown };
      delete page.showDate;
      delete page.tagId;
      const converted: Page = {
        ...page,
        kind: page.kind ?? "lined",
        sectionId: sectionIdOf(raw as { tagId?: string | null; sectionId?: string }),
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
    }),
    canvas: {
      notebookId: nb.id,
      gridEnabled: canvas.gridEnabled !== false,
      elements: canvas.elements,
    },
  };
}
