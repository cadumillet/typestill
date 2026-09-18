// Zine pages: the page kind for images. One media block (a single image or a grid of two
// to four), optional text below the media and beside it, and a padding. Nothing is
// dragged: the layout is computed from the page size and these settings. These helpers
// work on the stored shape alone so the store, the backup converter and their tests need
// no browser.

import { isColumn, isBlankDocument, type Column } from "./document";
import { RULE_PITCH_MM, TEXT_INSET_MM } from "./paper";

export type ZineLayout = "single" | "row" | "column" | "square";
export const ZINE_LAYOUTS: readonly ZineLayout[] = ["single", "row", "column", "square"];

export type ZineFit = "cover" | "contain";
export type ZineTextSide = "right" | "left";

export interface ZineImage {
  /** A file in the notebook's files table, shared with the canvas. */
  fileId: string;
  /** Cover crops the image to fill its cell; contain letterboxes it. */
  fit: ZineFit;
}

export interface Zine {
  /** mm; 0 = images bleed to the page edges. Also the gap between blocks. */
  padding: number;
  media: {
    layout: ZineLayout;
    /** One entry per cell of the layout, null while the cell is empty. */
    images: (ZineImage | null)[];
  };
  /** Reserves textRows lines at the bottom, under the media. */
  textBelow: Column | null;
  /** Reserves a column a third of the page wide, the full height of the page. */
  textBeside: Column | null;
  textSide: ZineTextSide;
  textRows: number;
}

/** Zine defaults of the built-in themes, and the fallback when no theme is at hand. */
export const DEFAULT_ZINE_PADDING_MM = 8;
export const DEFAULT_ZINE_TEXT_ROWS = 4;
export const MAX_ZINE_PADDING_MM = 20;
export const MAX_ZINE_TEXT_ROWS = 12;

export function cellCount(layout: ZineLayout): number {
  return layout === "single" ? 1 : layout === "square" ? 4 : 2;
}

/** The images array sized for a layout: extra cells are dropped, missing ones are empty. */
export function imagesForLayout(
  images: readonly (ZineImage | null)[],
  layout: ZineLayout,
): (ZineImage | null)[] {
  const count = cellCount(layout);
  return Array.from({ length: count }, (_, i) => images[i] ?? null);
}

/**
 * Places images: the first into the given cell (replacing what is there), the rest into
 * the empty cells that follow. Images with no cell left are dropped.
 */
export function placeImages(zine: Zine, cell: number, fileIds: readonly string[]): Zine {
  const images = [...zine.media.images];
  let next = 0;
  for (const fileId of fileIds) {
    const target = next === 0 ? cell : images.findIndex((image, i) => i > cell && image === null);
    if (target < 0 || target >= images.length) break;
    images[target] = { fileId, fit: "cover" };
    next += 1;
  }
  return { ...zine, media: { ...zine.media, images } };
}

/** The first empty cell, or null when every cell is filled. Where a paste with no cell chosen lands. */
export function defaultCell(zine: Zine): number | null {
  const empty = zine.media.images.indexOf(null);
  return empty < 0 ? null : empty;
}

export function emptyZine(
  defaults: { defaultPaddingMm: number; defaultTextRows: number } = {
    defaultPaddingMm: DEFAULT_ZINE_PADDING_MM,
    defaultTextRows: DEFAULT_ZINE_TEXT_ROWS,
  },
): Zine {
  return {
    padding: defaults.defaultPaddingMm,
    media: { layout: "single", images: [null] },
    textBelow: null,
    textBeside: null,
    textSide: "right",
    textRows: defaults.defaultTextRows,
  };
}

/** A zine page with no images and no text. */
export function isZineEmpty(zine: Zine): boolean {
  return (
    zine.media.images.every((image) => image === null) &&
    (zine.textBelow === null || isBlankDocument(zine.textBelow.doc)) &&
    (zine.textBeside === null || isBlankDocument(zine.textBeside.doc))
  );
}

/** File ids the page's media block uses, without duplicates. */
export function zineFileIds(zine: Zine): string[] {
  const ids = new Set<string>();
  for (const image of zine.media.images) if (image) ids.add(image.fileId);
  return [...ids];
}

/** The page's text, for search: the block below, then the block beside. */
export function zineText(zine: Zine): string {
  return [zine.textBelow?.text, zine.textBeside?.text].filter(Boolean).join("\n");
}

/** A rectangle on the page in mm from the top-left corner. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ZineGeometry {
  /** The whole media block. */
  media: Box;
  /** One box per cell, in reading order. */
  cells: Box[];
  /** Where the text editors go: inset from their blocks so text clears the edges. */
  textBelow: Box | null;
  textBeside: Box | null;
}

/**
 * Lays a zine page out. The padding insets the media on every side and is the gap
 * between cells and blocks. Text beside takes a third of the page width down the full
 * height of the padded area; text below takes textRows lines under the media only.
 */
export function zineGeometry(
  page: { width: number; height: number },
  zine: Zine,
  pitch = RULE_PITCH_MM,
  inset = TEXT_INSET_MM,
): ZineGeometry {
  const p = zine.padding;
  const gap = p;
  const inner: Box = { left: p, top: p, width: page.width - 2 * p, height: page.height - 2 * p };
  // Text sits a little inside its block; twice that when the page bleeds, to clear the edge.
  const textInset = p > 0 ? inset : 2 * inset;

  let mediaLeft = inner.left;
  let mediaWidth = inner.width;
  let textBeside: Box | null = null;
  if (zine.textBeside) {
    const width = page.width / 3;
    mediaWidth = inner.width - width - gap;
    const left = zine.textSide === "right" ? inner.left + inner.width - width : inner.left;
    if (zine.textSide === "left") mediaLeft = inner.left + width + gap;
    textBeside = {
      left: left + textInset,
      top: inner.top + textInset,
      width: width - 2 * textInset,
      height: inner.height - 2 * textInset,
    };
  }

  let mediaHeight = inner.height;
  let textBelow: Box | null = null;
  if (zine.textBelow) {
    const height = zine.textRows * pitch;
    mediaHeight = inner.height - height - gap;
    textBelow = {
      left: mediaLeft + textInset,
      top: inner.top + inner.height - height,
      width: mediaWidth - 2 * textInset,
      height,
    };
  }

  const media: Box = { left: mediaLeft, top: inner.top, width: mediaWidth, height: mediaHeight };
  return { media, cells: cellBoxes(media, zine.media.layout, gap), textBelow, textBeside };
}

function cellBoxes(media: Box, layout: ZineLayout, gap: number): Box[] {
  const columns = layout === "row" || layout === "square" ? 2 : 1;
  const rows = layout === "column" || layout === "square" ? 2 : 1;
  const width = (media.width - gap * (columns - 1)) / columns;
  const height = (media.height - gap * (rows - 1)) / rows;
  const cells: Box[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      cells.push({
        left: media.left + c * (width + gap),
        top: media.top + r * (height + gap),
        width,
        height,
      });
    }
  }
  return cells;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isZineImage(value: unknown): value is ZineImage {
  return (
    isRecord(value) &&
    typeof value.fileId === "string" &&
    value.fileId.length > 0 &&
    (value.fit === "cover" || value.fit === "contain")
  );
}

/** Whether a value is a stored zine: the shape above, with one image slot per cell. */
export function isZine(value: unknown): value is Zine {
  if (!isRecord(value)) return false;
  const media = value.media;
  return (
    typeof value.padding === "number" &&
    value.padding >= 0 &&
    isRecord(media) &&
    ZINE_LAYOUTS.includes(media.layout as ZineLayout) &&
    Array.isArray(media.images) &&
    media.images.length === cellCount(media.layout as ZineLayout) &&
    media.images.every((image) => image === null || isZineImage(image)) &&
    (value.textBelow === null || isColumn(value.textBelow)) &&
    (value.textBeside === null || isColumn(value.textBeside)) &&
    (value.textSide === "right" || value.textSide === "left") &&
    typeof value.textRows === "number" &&
    value.textRows >= 1
  );
}
