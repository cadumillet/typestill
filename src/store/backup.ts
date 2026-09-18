// The backup file: one notebook as JSON, images inlined as data URLs.
//
// Versions: 1 had plain-string columns; 2 (text formatting) has { text, doc } columns;
// 3 (notebook cover) adds the cover; 4 (zine pages) adds the page kind and the zine
// block; 5 (themes) adds the notebook's theme id. Older files are still read: version 1
// columns are converted, each line break becoming a paragraph boundary, a missing cover
// is the default one, a page without a kind is lined, and a missing theme is Ruled.

import { DEFAULT_COVER, isCover } from "../notebook/cover";
import { columnFromText, isColumn } from "../page/document";
import { DEFAULT_MARGIN_MM, PAGE_SIZES_MM } from "../page/paper";
import { isZine } from "../page/zine";
import { DEFAULT_THEME_ID } from "../theme/themes";
import type { Column, NotebookDocument } from "./model";

export const BACKUP_FORMAT = "typestill-notebook";
export const BACKUP_VERSION = 5;
const READABLE_VERSIONS = new Set([1, 2, 3, 4, 5]);

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
  expect(Array.isArray(nb.tags), "Invalid tags");
  expect(isRecord(nb.files), "Invalid files");
  expect(Array.isArray(nb.pages), "Invalid pages");
  for (const page of nb.pages) {
    expect(isRecord(page), "Invalid page");
    expect(typeof page.id === "string" && page.id.length > 0, "Page has no id");
    expect(typeof page.createdAt === "number", "Page has no createdAt");
    expect(
      page.kind === undefined || page.kind === "lined" || page.kind === "zine",
      "Page has an invalid kind",
    );
    const zine = page.kind === "zine";
    expect(!zine || isZine(page.zine), "Page has an invalid zine block");
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
  const doc = nb as unknown as NotebookDocument;
  return {
    ...doc,
    lastOpenedAt: typeof nb.lastOpenedAt === "number" ? nb.lastOpenedAt : nb.createdAt,
    lastPageId: typeof nb.lastPageId === "string" ? nb.lastPageId : null,
    cover: isCover(nb.cover) ? nb.cover : { ...DEFAULT_COVER },
    themeId: typeof nb.themeId === "string" ? nb.themeId : DEFAULT_THEME_ID,
    defaults: {
      ...doc.defaults,
      margin: typeof defaults.margin === "number" ? defaults.margin : DEFAULT_MARGIN_MM,
    },
    pages: doc.pages.map((page) => ({
      ...page,
      kind: page.kind ?? "lined",
      margin: typeof page.margin === "number" ? page.margin : DEFAULT_MARGIN_MM,
      columns: (page.columns as (string | Column)[]).map((column) =>
        typeof column === "string" ? columnFromText(column) : column,
      ),
    })),
    canvas: {
      notebookId: nb.id,
      gridEnabled: canvas.gridEnabled !== false,
      elements: canvas.elements,
    },
  };
}
