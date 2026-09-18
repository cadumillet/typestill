// Stored shapes. Mirrors the data model in PLAN.md: notebook metadata, text pages, one
// canvas per notebook, and the image files the canvas references. They are separate
// records so autosave writes only what changed.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import type { Cover } from "../notebook/cover";
import { columnFromDocument, columnFromText, joinDocuments, type Column } from "../page/document";
import { DEFAULT_MARGIN_MM, type Orientation, type PageSize } from "../page/paper";
import { zineFileIds, type Zine } from "../page/zine";

export type { Cover } from "../notebook/cover";
export type { Column } from "../page/document";
export type { Zine } from "../page/zine";

/** Lined pages hold writing; zine pages hold images. */
export type PageKind = "lined" | "zine";

export interface Tag {
  id: string;
  name: string;
  color: string;
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
  tags: Tag[];
}

/** Where a page left the canvas: Excalidraw's scroll offset and zoom. */
export interface CanvasView {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

/** A page: lined, with one or two columns of text, or zine, with a media block. */
export interface Page {
  id: string;
  notebookId: string;
  /** Also the page order. Strictly increasing within a notebook. */
  createdAt: number;
  kind: PageKind;
  tagId: string | null;
  showPageNumber: boolean;
  /** Margin line offset in mm from the left edge. */
  margin: number;
  /** Lined pages: one or two columns of text. Zine pages: none. */
  columns: Column[];
  /** Zine pages: the rows of blocks. */
  zine?: Zine;
  /** Divider offset in mm from the left edge, null for one column. */
  divider: number | null;
  canvasView: CanvasView | null;
}

/** The notebook's one drawing surface. */
export interface Canvas {
  notebookId: string;
  gridEnabled: boolean;
  /** Plain Excalidraw elements, with deleted ones already dropped. */
  elements: ExcalidrawElement[];
}

/** An image, used by zine pages or the canvas. File ids are content hashes. */
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

/** File ids the zine pages use, without duplicates. */
export function pageFileIds(pages: readonly Page[]): string[] {
  const ids = new Set<string>();
  for (const page of pages) {
    if (page.zine) for (const id of zineFileIds(page.zine)) ids.add(id);
  }
  return [...ids];
}
