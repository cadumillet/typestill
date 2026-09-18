// The zine shape of backup versions 4 and 5 (Dexie versions 4 to 6): one media block
// with a layout and its images, optional text below and beside it, the text's side and
// its rows. Version 6 stores rows of blocks instead (zine.ts); this converts the old
// shape losslessly: the media block becomes the first row, with the text beside it as
// that row's second block on the side it had, and the text below becomes a second row
// with the same rows of text. A page with no images and no writing becomes an empty
// page, since that is what it showed.

import { isBlankDocument, isColumn, type Column } from "./document";
import {
  cellCount,
  isZineImage,
  mediaBlockFor,
  type MediaLayout,
  type Zine,
  type ZineBlock,
  type ZineImage,
  type ZineRow,
} from "./zine";

export interface LegacyZine {
  padding: number;
  media: { layout: MediaLayout; images: (ZineImage | null)[] };
  textBelow: Column | null;
  textBeside: Column | null;
  textSide: "right" | "left";
  textRows: number;
}

const LEGACY_LAYOUTS = new Set<string>(["single", "row", "column", "square"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a value is a zine of the old shape. */
export function isLegacyZine(value: unknown): value is LegacyZine {
  if (!isRecord(value)) return false;
  const media = value.media;
  return (
    typeof value.padding === "number" &&
    value.padding >= 0 &&
    isRecord(media) &&
    typeof media.layout === "string" &&
    LEGACY_LAYOUTS.has(media.layout) &&
    Array.isArray(media.images) &&
    media.images.length === cellCount(media.layout as MediaLayout) &&
    media.images.every((image) => image === null || isZineImage(image)) &&
    (value.textBelow === null || isColumn(value.textBelow)) &&
    (value.textBeside === null || isColumn(value.textBeside)) &&
    (value.textSide === "right" || value.textSide === "left") &&
    typeof value.textRows === "number" &&
    value.textRows >= 1
  );
}

/** The old shape as rows of blocks. Nothing is lost. */
export function convertLegacyZine(legacy: LegacyZine): Zine {
  const hasImages = legacy.media.images.some((image) => image !== null);
  const written = (column: Column | null) => column !== null && !isBlankDocument(column.doc);
  if (!hasImages && !written(legacy.textBelow) && !written(legacy.textBeside)) {
    return { padding: legacy.padding, rows: [] };
  }
  const media = mediaBlockFor(legacy.media.layout, legacy.media.images);
  const first: ZineBlock[] = [media];
  if (legacy.textBeside) {
    const beside: ZineBlock = { kind: "text", column: legacy.textBeside, rows: legacy.textRows };
    if (legacy.textSide === "left") first.unshift(beside);
    else first.push(beside);
  }
  const rows: ZineRow[] = [{ blocks: first }];
  if (legacy.textBelow) {
    rows.push({ blocks: [{ kind: "text", column: legacy.textBelow, rows: legacy.textRows }] });
  }
  return { padding: legacy.padding, rows };
}
