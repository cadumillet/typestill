// Zine pages: the page kind for images. A page is rows of blocks, top to bottom; a row is
// one block or two side by side sharing the width equally. A block is an image, a grid
// of two to four images, or a text block with a fixed number of rows. Nothing is
// dragged: the layout is computed from the page size, the padding and the blocks. The
// stored shape is general; what the app allows is narrower (see `zineOptions`): one
// media block per page, one text block beside it and one text block in a row of its
// own. These helpers work on the stored shape alone so the store, the backup converter
// and their tests need no browser.

import { columnFromText, isColumn, isBlankDocument, type Column } from "./document";
import { RULE_PITCH_MM, TEXT_INSET_MM } from "./paper";

/** Grid presets: two side by side, two stacked, two by two. */
export type ZineLayout = "row" | "column" | "square";
export const ZINE_LAYOUTS: readonly ZineLayout[] = ["row", "column", "square"];
/** The media block's layout choices: a single image or a grid preset. */
export type MediaLayout = "single" | ZineLayout;
export const MEDIA_LAYOUTS: readonly MediaLayout[] = ["single", ...ZINE_LAYOUTS];

export type ZineFit = "cover" | "contain";

export interface ZineImage {
  /** A file in the notebook's files table, shared with the canvas. */
  fileId: string;
  /** Cover crops the image to fill its cell; contain letterboxes it. */
  fit: ZineFit;
}

export type ZineBlock =
  | { kind: "image"; image: ZineImage | null }
  | { kind: "grid"; layout: ZineLayout; images: (ZineImage | null)[] }
  | { kind: "text"; column: Column; rows: number };

export type ZineBlockKind = ZineBlock["kind"];
export type MediaBlock = Extract<ZineBlock, { kind: "image" | "grid" }>;
export type TextBlock = Extract<ZineBlock, { kind: "text" }>;

export interface ZineRow {
  /** One block, or two side by side sharing the width equally. */
  blocks: ZineBlock[];
}

export interface Zine {
  /** mm; 0 = images bleed to the page edges. Also the gap between blocks. */
  padding: number;
  /** Top to bottom; an empty page has none. */
  rows: ZineRow[];
}

/** Zine defaults of the built-in themes, and the fallback when no theme is at hand. */
export const DEFAULT_ZINE_PADDING_MM = 0;
export const DEFAULT_ZINE_TEXT_ROWS = 4;
export const MAX_ZINE_PADDING_MM = 20;
export const MAX_ZINE_TEXT_ROWS = 12;
/** A row of blocks holds at most this many. */
export const MAX_BLOCKS_PER_ROW = 2;

export interface ZineDefaults {
  defaultPaddingMm: number;
  defaultTextRows: number;
}

const FALLBACK_DEFAULTS: ZineDefaults = {
  defaultPaddingMm: DEFAULT_ZINE_PADDING_MM,
  defaultTextRows: DEFAULT_ZINE_TEXT_ROWS,
};

export function emptyZine(defaults: ZineDefaults = FALLBACK_DEFAULTS): Zine {
  return { padding: defaults.defaultPaddingMm, rows: [] };
}

export function cellCount(layout: MediaLayout): number {
  return layout === "single" ? 1 : layout === "square" ? 4 : 2;
}

/** The images array sized for a layout: extra cells are dropped, missing ones are empty. */
export function imagesForLayout(
  images: readonly (ZineImage | null)[],
  layout: MediaLayout,
): (ZineImage | null)[] {
  const count = cellCount(layout);
  return Array.from({ length: count }, (_, i) => images[i] ?? null);
}

export const isMediaBlock = (block: ZineBlock): block is MediaBlock => block.kind !== "text";
export const isTextBlock = (block: ZineBlock): block is TextBlock => block.kind === "text";

/** A media block's cells, one slot per cell, null while empty. */
export function mediaCells(block: MediaBlock): (ZineImage | null)[] {
  return block.kind === "image" ? [block.image] : block.images;
}

/** The media block with new cell contents, of the same shape. */
export function withMediaCells(block: MediaBlock, images: (ZineImage | null)[]): MediaBlock {
  return block.kind === "image"
    ? { kind: "image", image: images[0] ?? null }
    : { kind: "grid", layout: block.layout, images: imagesForLayout(images, block.layout) };
}

export function mediaLayoutOf(block: MediaBlock): MediaLayout {
  return block.kind === "image" ? "single" : block.layout;
}

/** A media block of the given layout holding these images. */
export function mediaBlockFor(
  layout: MediaLayout,
  images: readonly (ZineImage | null)[],
): MediaBlock {
  const sized = imagesForLayout(images, layout);
  return layout === "single"
    ? { kind: "image", image: sized[0] }
    : { kind: "grid", layout, images: sized };
}

export interface BlockAddress {
  row: number;
  index: number;
}

/** Where the page's media block is (the app allows one), or null. */
export function mediaBlockOf(zine: Zine): (BlockAddress & { block: MediaBlock }) | null {
  for (const [row, { blocks }] of zine.rows.entries()) {
    for (const [index, block] of blocks.entries()) {
      if (isMediaBlock(block)) return { row, index, block };
    }
  }
  return null;
}

export function blockAt(zine: Zine, at: BlockAddress): ZineBlock | undefined {
  return zine.rows[at.row]?.blocks[at.index];
}

/** The zine with the block at `at` replaced. */
export function replaceBlock(zine: Zine, at: BlockAddress, block: ZineBlock): Zine {
  return {
    ...zine,
    rows: zine.rows.map((row, r) =>
      r === at.row ? { blocks: row.blocks.map((b, i) => (i === at.index ? block : b)) } : row,
    ),
  };
}

/** The zine without the block at `at`; a row left empty goes too. */
export function removeBlock(zine: Zine, at: BlockAddress): Zine {
  const rows = zine.rows
    .map((row, r) => (r === at.row ? { blocks: row.blocks.filter((_, i) => i !== at.index) } : row))
    .filter((row) => row.blocks.length > 0);
  return { ...zine, rows };
}

/** A fresh block of a kind. */
export function newBlock(
  kind: ZineBlockKind,
  defaults: ZineDefaults = FALLBACK_DEFAULTS,
): ZineBlock {
  switch (kind) {
    case "image":
      return { kind: "image", image: null };
    case "grid":
      return { kind: "grid", layout: "row", images: [null, null] };
    case "text":
      return { kind: "text", column: columnFromText(""), rows: defaults.defaultTextRows };
  }
}

/** Where a block can be added: a new row at the bottom, or beside the blocks of a row. */
export type AddPlace = { row: "below" } | { row: number; side: "left" | "right" };

/** The zine with a new block of `kind` at `place`. */
export function addBlock(
  zine: Zine,
  place: AddPlace,
  kind: ZineBlockKind,
  defaults: ZineDefaults = FALLBACK_DEFAULTS,
): Zine {
  const block = newBlock(kind, defaults);
  if (place.row === "below") return { ...zine, rows: [...zine.rows, { blocks: [block] }] };
  const { row, side } = place;
  const rows = zine.rows.map((r, i) =>
    i === row ? { blocks: side === "left" ? [block, ...r.blocks] : [...r.blocks, block] } : r,
  );
  return { ...zine, rows };
}

/** What the app allows to be added, and where. */
export interface ZineOptions {
  /** Kinds a new bottom row may hold; empty when nothing more goes below. */
  below: ZineBlockKind[];
  /** The row whose media block may take a text block beside it, or null. */
  beside: number | null;
}

/**
 * The composition rules: one media block per page, one text block beside it (in its
 * row) and one text block in a row of its own. Two blocks fill a row.
 */
export function zineOptions(zine: Zine): ZineOptions {
  const media = mediaBlockOf(zine);
  const textRows = zine.rows.filter((row) => row.blocks.every(isTextBlock)).length;
  const below: ZineBlockKind[] = [];
  if (!media) below.push("image", "grid");
  if (textRows === 0) below.push("text");
  const beside =
    media && zine.rows[media.row].blocks.length < MAX_BLOCKS_PER_ROW ? media.row : null;
  return { below, beside };
}

/**
 * Places images into the media block: the first into the given cell (replacing what is
 * there), the rest into the empty cells that follow. Images with no cell left are
 * dropped. A page with no media block gets one sized to the images: a single image, a
 * pair side by side, or two by two.
 */
export function placeImages(zine: Zine, cell: number, fileIds: readonly string[]): Zine {
  const media = mediaBlockOf(zine);
  if (!media) {
    if (fileIds.length === 0) return zine;
    const layout: MediaLayout =
      fileIds.length === 1 ? "single" : fileIds.length === 2 ? "row" : "square";
    const images = fileIds
      .slice(0, cellCount(layout))
      .map((fileId) => ({ fileId, fit: "cover" as const }));
    return { ...zine, rows: [...zine.rows, { blocks: [mediaBlockFor(layout, images)] }] };
  }
  const images = [...mediaCells(media.block)];
  let next = 0;
  for (const fileId of fileIds) {
    const target = next === 0 ? cell : images.findIndex((image, i) => i > cell && image === null);
    if (target < 0 || target >= images.length) break;
    images[target] = { fileId, fit: "cover" };
    next += 1;
  }
  return replaceBlock(zine, media, withMediaCells(media.block, images));
}

/** The first empty cell of the media block, or null when there is none. Where a paste with no cell chosen lands. */
export function defaultCell(zine: Zine): number | null {
  const media = mediaBlockOf(zine);
  if (!media) return null;
  const empty = mediaCells(media.block).indexOf(null);
  return empty < 0 ? null : empty;
}

/** A zine page with no blocks at all. Only such a page can change kind. */
export function isZineEmpty(zine: Zine): boolean {
  return zine.rows.length === 0;
}

/** Whether a text block has writing in it. */
export function hasWriting(block: TextBlock): boolean {
  return !isBlankDocument(block.column.doc);
}

/** File ids the page's media block uses, without duplicates. */
export function zineFileIds(zine: Zine): string[] {
  const ids = new Set<string>();
  for (const { blocks } of zine.rows) {
    for (const block of blocks) {
      if (isMediaBlock(block))
        for (const image of mediaCells(block)) if (image) ids.add(image.fileId);
    }
  }
  return [...ids];
}

/** The page's text, for search: the text blocks in reading order. */
export function zineText(zine: Zine): string {
  const parts: string[] = [];
  for (const { blocks } of zine.rows) {
    for (const block of blocks)
      if (isTextBlock(block) && block.column.text) parts.push(block.column.text);
  }
  return parts.join("\n");
}

/** A rectangle on the page in mm from the top-left corner. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BlockGeometry {
  block: ZineBlock;
  at: BlockAddress;
  /** The block's own rectangle. */
  box: Box;
  /** Media blocks: one box per cell, in reading order. */
  cells: Box[];
  /** Text blocks: where the editor goes, inset from the block so text clears the edges. */
  text: Box | null;
  /** Text blocks: the lines of text the block holds. */
  lines: number;
}

export interface ZineGeometry {
  /** The page inset by the padding. */
  inner: Box;
  rows: BlockGeometry[][];
}

/**
 * Lays a zine page out. The padding insets the blocks from the page edges and is the
 * gap between rows, blocks and cells. A row of text blocks is as tall as its rows of
 * text; a row with a media block takes what is left, so a taller text block shortens
 * the image. Two blocks in a row split the width in half.
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

  const fixedHeight = (row: ZineRow): number | null => {
    if (row.blocks.some(isMediaBlock)) return null;
    const rows = Math.max(...row.blocks.map((block) => (isTextBlock(block) ? block.rows : 1)));
    return rows * pitch + 2 * textInset;
  };
  const heights = zine.rows.map(fixedHeight);
  const flexible = heights.filter((h) => h === null).length;
  const fixedTotal = heights.reduce<number>((sum, h) => sum + (h ?? 0), 0);
  const gaps = Math.max(0, zine.rows.length - 1) * gap;
  const remaining = Math.max(0, inner.height - fixedTotal - gaps);
  const flexHeight = flexible > 0 ? remaining / flexible : 0;

  let top = inner.top;
  const rows = zine.rows.map((row, r) => {
    const height = heights[r] ?? flexHeight;
    const count = row.blocks.length;
    const width = (inner.width - gap * (count - 1)) / count;
    const blocks = row.blocks.map((block, index): BlockGeometry => {
      const box: Box = { left: inner.left + index * (width + gap), top, width, height };
      if (isMediaBlock(block)) {
        return {
          block,
          at: { row: r, index },
          box,
          cells: cellBoxes(box, mediaLayoutOf(block), gap),
          text: null,
          lines: 0,
        };
      }
      const text: Box = {
        left: box.left + textInset,
        top: box.top + textInset,
        width: box.width - 2 * textInset,
        height: box.height - 2 * textInset,
      };
      // A text block in a row of its own is exactly its rows; beside a media block it
      // takes the rows that fit the row's height.
      const lines =
        heights[r] !== null ? block.rows : Math.max(1, Math.floor(text.height / pitch + 1e-6));
      return { block, at: { row: r, index }, box, cells: [], text, lines };
    });
    top += height + gap;
    return blocks;
  });
  return { inner, rows };
}

function cellBoxes(media: Box, layout: MediaLayout, gap: number): Box[] {
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

export function isZineImage(value: unknown): value is ZineImage {
  return (
    isRecord(value) &&
    typeof value.fileId === "string" &&
    value.fileId.length > 0 &&
    (value.fit === "cover" || value.fit === "contain")
  );
}

function isZineBlock(value: unknown): value is ZineBlock {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "image":
      return value.image === null || isZineImage(value.image);
    case "grid":
      return (
        ZINE_LAYOUTS.includes(value.layout as ZineLayout) &&
        Array.isArray(value.images) &&
        value.images.length === cellCount(value.layout as ZineLayout) &&
        value.images.every((image) => image === null || isZineImage(image))
      );
    case "text":
      return isColumn(value.column) && typeof value.rows === "number" && value.rows >= 1;
    default:
      return false;
  }
}

/** Whether a value is a stored zine: rows of one or two blocks, each of a known kind. */
export function isZine(value: unknown): value is Zine {
  return (
    isRecord(value) &&
    typeof value.padding === "number" &&
    value.padding >= 0 &&
    Array.isArray(value.rows) &&
    value.rows.every(
      (row) =>
        isRecord(row) &&
        Array.isArray(row.blocks) &&
        row.blocks.length >= 1 &&
        row.blocks.length <= MAX_BLOCKS_PER_ROW &&
        row.blocks.every(isZineBlock),
    )
  );
}
