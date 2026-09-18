// Stored shapes. Mirrors the data model in PLAN.md: notebook metadata with its size and
// its sections (cuts on sheet boundaries), pages as slots (one per position, each with
// its own drawing and its fill), one canvas per notebook, and the image files the pages
// and the canvas reference. They are separate records so autosave writes only what
// changed.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import type { Cover } from "../notebook/cover";
import {
  columnFromDocument,
  columnFromText,
  isBlankDocument,
  joinDocuments,
  type Column,
} from "../page/document";
import { DEFAULT_MARGIN_MM, type Orientation, type PageSize } from "../page/paper";
import { emptyZine, isZineEmpty, zineFileIds, type Zine } from "../page/zine";
import { getTheme } from "../theme/themes";

export type { Cover } from "../notebook/cover";
export type { Column } from "../page/document";
export type { Zine } from "../page/zine";

/** Lined pages hold writing; zine pages hold images. */
export type PageKind = "lined" | "zine";

/** A folded sheet is four pages: the notebook's size and every cut are multiples of it. */
export const SHEET = 4;
/** The sizes a notebook is made at, in pages. It can grow past them by whole sheets. */
export const NOTEBOOK_SIZES = [64, 96, 128, 192] as const;
export const DEFAULT_NOTEBOOK_SIZE = 96;

/**
 * A division of the notebook, as a tabbed divider makes one: a cut at a sheet boundary
 * that runs to the next cut or the end. A page's section follows from the cuts.
 */
export interface Section {
  id: string;
  name: string;
  /** From the cover palette. */
  color: string;
  /** The 0-based position of its first page, a multiple of SHEET; the first section's is 0. */
  start: number;
  /** Where the section was left: its name in the grid returns there. Null until it is visited. */
  lastPageId: string | null;
}

export interface NotebookDefaults {
  showPageNumber: boolean;
  /** Margin line offset in mm from the left edge for new pages. */
  margin: number;
  /** Divider offset in mm from the left edge for new pages, null for one column. */
  divider: number | null;
}

/** Notebook metadata. The shelf reads only this. */
export interface Notebook {
  id: string;
  name: string;
  createdAt: number;
  lastOpenedAt: number;
  /** The page the notebook opens at: the one last shown. */
  lastPageId: string | null;
  /** How the notebook looks when closed: the swatch in the bar and the shelf card. */
  cover: Cover;
  /** The look of the pages: a built-in theme's id (src/theme/themes.ts). */
  themeId: string;
  pageSize: PageSize;
  orientation: Orientation;
  defaults: NotebookDefaults;
  /** Pages, a multiple of SHEET: one of NOTEBOOK_SIZES when made, more by whole sheets. */
  size: number;
  /** In order of start; at least one, the first starting at 0. */
  sections: Section[];
}

/** Where a page's drawing paints in writing mode: over the text, or under it. */
export type DrawingLayer = "over" | "under";

/** Where a page left the canvas: Excalidraw's scroll offset and zoom. */
export interface CanvasView {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

/**
 * A page: lined, with one or two columns of text, or zine, with a media block. Every
 * page is a slot the notebook has from the start; it is cleared, never deleted.
 */
export interface Page {
  id: string;
  notebookId: string;
  /** When the slot was made. Strictly increasing within a notebook. */
  createdAt: number;
  /** The 0-based slot in the notebook: the page order, and the page number less one. */
  position: number;
  kind: PageKind;
  /** How full the page is, 0 to 1, updated on save: the shade of its square in the grid. */
  fill: number;
  showPageNumber: boolean;
  /** Margin line offset in mm from the left edge. */
  margin: number;
  /** Lined pages: one or two columns of text. Zine pages: none. */
  columns: Column[];
  /** Zine pages: the rows of blocks. */
  zine?: Zine;
  /** Divider offset in mm from the left edge, null for one column. */
  divider: number | null;
  /**
   * The page's drawing: plain Excalidraw elements in page coordinates (scene (0, 0) is
   * the page's top-left corner), with deleted ones already dropped. Empty for none.
   */
  drawing: ExcalidrawElement[];
  drawingLayer: DrawingLayer;
  canvasView: CanvasView | null;
}

/** The notebook's one drawing surface. */
export interface Canvas {
  notebookId: string;
  gridEnabled: boolean;
  /** Plain Excalidraw elements, with deleted ones already dropped. */
  elements: ExcalidrawElement[];
}

/** An image, used by zine pages, page drawings or the canvas. File ids are content hashes. */
export interface NotebookFile {
  notebookId: string;
  id: string;
  data: BinaryFileData;
}

/** A page's rendered thumbnail. A cache, not part of the backup. */
export interface Thumbnail {
  pageId: string;
  notebookId: string;
  /** A PNG data URL. */
  dataURL: string;
  updatedAt: number;
}

/** The whole notebook as one document: what a backup file contains. */
export interface NotebookDocument extends Notebook {
  pages: Page[];
  canvas: Canvas;
  files: Record<string, BinaryFileData>;
}

export const DEFAULT_NOTEBOOK_DEFAULTS: NotebookDefaults = {
  showPageNumber: true,
  margin: DEFAULT_MARGIN_MM,
  divider: null,
};

export function newId(): string {
  return crypto.randomUUID();
}

/**
 * A blank page at `position` from the notebook's defaults: lined with the default
 * divider unless told otherwise, zine with the theme's padding. What a new notebook is
 * filled with, what growing appends, and what the converter pads a section with.
 */
export function blankPage(
  notebook: Pick<Notebook, "id" | "defaults" | "themeId">,
  position: number,
  createdAt: number,
  kind: PageKind = "lined",
  divider: number | null = notebook.defaults.divider,
): Page {
  const page: Page = {
    id: newId(),
    notebookId: notebook.id,
    createdAt,
    position,
    kind,
    fill: 0,
    showPageNumber: notebook.defaults.showPageNumber,
    margin: notebook.defaults.margin,
    columns: kind === "lined" ? emptyColumns(divider) : [],
    divider: kind === "lined" ? divider : null,
    drawing: [],
    drawingLayer: "over",
    canvasView: null,
  };
  if (kind === "zine") page.zine = emptyZine(getTheme(notebook.themeId).zine);
  return page;
}

/** A page with nothing written or placed on it. Only such a page can change kind. */
export function isPageEmpty(page: Pick<Page, "kind" | "columns" | "zine">): boolean {
  if (page.kind === "zine") return !page.zine || isZineEmpty(page.zine);
  return page.columns.every((column) => isBlankDocument(column.doc));
}

/** An empty page with nothing drawn on it either: what shrinking drops and the converter shades 0. */
export function isPageBlank(page: Pick<Page, "kind" | "columns" | "zine" | "drawing">): boolean {
  return isPageEmpty(page) && !page.drawing.some((element) => !element.isDeleted);
}

/** Empty columns for a divider setting: one without a divider, two with. */
export function emptyColumns(divider: number | null): Column[] {
  return divider === null ? [columnFromText("")] : [columnFromText(""), columnFromText("")];
}

/**
 * Columns after adding or removing a divider. Adding one keeps the text in the left
 * column; removing one joins the right column's paragraphs after the left column's.
 */
export function columnsForDivider(columns: readonly Column[], divider: number | null): Column[] {
  if (divider === null && columns.length === 2) {
    const [left, right] = columns;
    return [columnFromDocument(joinDocuments(left.doc, right.doc))];
  }
  if (divider !== null && columns.length === 1) return [columns[0], columnFromText("")];
  return [...columns];
}

/** File ids referenced by image elements, without duplicates. */
export function referencedFileIds(elements: readonly ExcalidrawElement[]): string[] {
  const ids = new Set<string>();
  for (const element of elements) {
    if (element.type === "image" && element.fileId && !element.isDeleted) ids.add(element.fileId);
  }
  return [...ids];
}

/** File ids the pages use, in zine blocks or in their drawings, without duplicates. */
export function pageFileIds(pages: readonly Page[]): string[] {
  const ids = new Set<string>();
  for (const page of pages) {
    if (page.zine) for (const id of zineFileIds(page.zine)) ids.add(id);
    for (const id of referencedFileIds(page.drawing)) ids.add(id);
  }
  return [...ids];
}
