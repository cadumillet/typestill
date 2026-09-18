// Clippings: free objects placed over or under a lined page's text, a drawing taken from
// the canvas or an image from the clipboard. The stored shape, its validator and the
// pure geometry (placement, corner resizing) live here; TextPage renders and moves them.
// Everything is in mm from the page's top left corner; the height follows the image.

import { SCENE_PX_PER_MM } from "./paper";

export type ClippingLayer = "over" | "under";

export interface Clipping {
  id: string;
  /** An SVG or PNG in the notebook's files table. */
  fileId: string;
  x: number;
  y: number;
  width: number;
  /** Over the text, or between the rules and the text. */
  layer: ClippingLayer;
}

/** Narrowest a clipping can be resized to, in mm. */
export const MIN_CLIPPING_WIDTH_MM = 5;

export type Corner = "nw" | "ne" | "sw" | "se";
export const CORNERS: readonly Corner[] = ["nw", "ne", "sw", "se"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isClipping(value: unknown): value is Clipping {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.fileId === "string" &&
    value.fileId.length > 0 &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    (value.layer === "over" || value.layer === "under")
  );
}

/** The file ids the clippings use, each once. */
export function clippingFileIds(clippings: readonly Clipping[]): string[] {
  return [...new Set(clippings.map((clipping) => clipping.fileId))];
}

/**
 * Where a new clipping lands: centred on the page at its natural size (scene px, as
 * the canvas measures things, converted to mm), capped at half the page width, on top.
 */
export function placeClipping(
  page: { width: number; height: number },
  natural: { width: number; height: number },
  ids: { id: string; fileId: string },
): Clipping {
  const aspect = natural.height / natural.width;
  const width = Math.max(
    MIN_CLIPPING_WIDTH_MM,
    Math.min(natural.width / SCENE_PX_PER_MM, page.width / 2),
  );
  return {
    ...ids,
    x: (page.width - width) / 2,
    y: (page.height - width * aspect) / 2,
    width,
    layer: "over",
  };
}

/**
 * A corner dragged to `pointer` (mm): the opposite corner stays put and the box keeps
 * its proportions, following whichever of the pointer's two distances asks for more,
 * never narrower than the minimum.
 */
export function resizeClipping(
  clipping: Clipping,
  aspect: number,
  corner: Corner,
  pointer: { x: number; y: number },
): Clipping {
  const height = clipping.width * aspect;
  const anchor = {
    x: corner === "nw" || corner === "sw" ? clipping.x + clipping.width : clipping.x,
    y: corner === "nw" || corner === "ne" ? clipping.y + height : clipping.y,
  };
  const dx = corner === "nw" || corner === "sw" ? anchor.x - pointer.x : pointer.x - anchor.x;
  const dy = corner === "nw" || corner === "ne" ? anchor.y - pointer.y : pointer.y - anchor.y;
  const width = Math.max(MIN_CLIPPING_WIDTH_MM, dx, aspect > 0 ? dy / aspect : 0);
  return {
    ...clipping,
    width,
    x: corner === "nw" || corner === "sw" ? anchor.x - width : anchor.x,
    y: corner === "nw" || corner === "ne" ? anchor.y - width * aspect : anchor.y,
  };
}

/** The topmost clipping under a point (mm), given each one's aspect; later ones paint on top. */
export function clippingAt(
  clippings: readonly Clipping[],
  aspects: ReadonlyMap<string, number>,
  point: { x: number; y: number },
): Clipping | null {
  for (let i = clippings.length - 1; i >= 0; i--) {
    const clipping = clippings[i];
    const aspect = aspects.get(clipping.id);
    if (aspect === undefined) continue;
    if (
      point.x >= clipping.x &&
      point.x <= clipping.x + clipping.width &&
      point.y >= clipping.y &&
      point.y <= clipping.y + clipping.width * aspect
    ) {
      return clipping;
    }
  }
  return null;
}
