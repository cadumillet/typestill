// Page geometry. The notebook's "paper units" are millimetres; the Excalidraw scene is
// measured in scene pixels at zoom 1. We map them at 96 dpi so 1 scene px = 1 CSS px
// when the page is shown at zoom 1.

export type PageSize = "A5" | "A4" | "Letter";
export type Orientation = "portrait" | "landscape";
export type Paper = "blank" | "lined" | "dotted";

/** Physical page dimensions in millimetres, portrait. */
export const PAGE_SIZES_MM: Record<PageSize, { width: number; height: number }> = {
  A5: { width: 148, height: 210 },
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
};

export const SCENE_PX_PER_MM = 96 / 25.4;

/** Distance between rules on lined paper. */
export const RULE_PITCH_MM = 7;
/** Blank margin above the first rule. */
export const RULE_TOP_MM = 20;
/** Grid pitch for dotted paper. */
export const DOT_PITCH_MM = 5;

/** Page dimensions in scene pixels at zoom 1. */
export interface PageGeometry {
  width: number;
  height: number;
}

export function pageGeometry(size: PageSize, orientation: Orientation): PageGeometry {
  const { width, height } = PAGE_SIZES_MM[size];
  const [w, h] = orientation === "portrait" ? [width, height] : [height, width];
  return { width: w * SCENE_PX_PER_MM, height: h * SCENE_PX_PER_MM };
}

/** A page box, in CSS pixels, plus the zoom that makes the scene fill it exactly. */
export interface PageFit {
  width: number;
  height: number;
  zoom: number;
}

/**
 * Largest page box that fits inside `available` while keeping the page's aspect ratio.
 * The width is snapped to a whole pixel and the zoom derived from it, so the canvas
 * width Excalidraw measures and the zoom we clamp to agree exactly.
 */
export function fitPage(
  geometry: PageGeometry,
  available: { width: number; height: number },
): PageFit {
  const scale = Math.min(available.width / geometry.width, available.height / geometry.height);
  const width = Math.max(1, Math.floor(geometry.width * scale));
  const zoom = width / geometry.width;
  return { width, height: geometry.height * zoom, zoom };
}

export function mmToCssPx(mm: number, zoom: number): number {
  return mm * SCENE_PX_PER_MM * zoom;
}
