// Stored shapes. Mirrors the data model in PLAN.md: notebook metadata, text pages, one
// canvas per notebook, and the image files the canvas references. They are separate
// records so autosave writes only what changed.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { DEFAULT_MARGIN_MM, type Orientation, type PageSize } from "../page/paper";

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface NotebookDefaults {
  showDate: boolean;
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

/** A lined text page. */
export interface Page {
  id: string;
  notebookId: string;
  /** Also the page order. Strictly increasing within a notebook. */
  createdAt: number;
  tagId: string | null;
  showDate: boolean;
  showPageNumber: boolean;
  /** Margin line offset in mm from the left edge. */
  margin: number;
  /** One or two plain-text columns. */
  columns: string[];
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

/** An image the canvas references. Excalidraw file ids are content hashes. */
export interface NotebookFile {
  notebookId: string;
  id: string;
  data: BinaryFileData;
}

/** The whole notebook as one document: what a backup file contains. */
export interface NotebookDocument extends Notebook {
  pages: Page[];
  canvas: Canvas;
  files: Record<string, BinaryFileData>;
}

export const DEFAULT_NOTEBOOK_DEFAULTS: NotebookDefaults = {
  showDate: true,
  showPageNumber: true,
  margin: DEFAULT_MARGIN_MM,
  divider: null,
};

export function newId(): string {
  return crypto.randomUUID();
}

/** Empty columns for a divider setting: one without a divider, two with. */
export function emptyColumns(divider: number | null): string[] {
  return divider === null ? [""] : ["", ""];
}

/**
 * Columns after adding or removing a divider. Adding one keeps the text in the left
 * column; removing one joins the right column's text after the left column's.
 */
export function columnsForDivider(columns: readonly string[], divider: number | null): string[] {
  if (divider === null && columns.length === 2) {
    const [left, right] = columns;
    return [left && right ? `${left}\n${right}` : left + right];
  }
  if (divider !== null && columns.length === 1) return [columns[0], ""];
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
