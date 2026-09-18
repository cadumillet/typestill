// Page geometry. Paper units are millimetres. The canvas side of the app (Excalidraw)
// measures its scene in pixels; we map the two at 96 dpi so 1 scene px = 1 CSS px at
// zoom 1. Text pages are laid out in mm scaled by a zoom, the same way.

import type { LinedMetrics } from "../theme/theme";

export type PageSize = "A5" | "A4" | "Letter";
export type Orientation = "portrait" | "landscape";

/** Physical page dimensions in millimetres, portrait. */
export const PAGE_SIZES_MM: Record<PageSize, { width: number; height: number }> = {
  A5: { width: 148, height: 210 },
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
};

export const SCENE_PX_PER_MM = 96 / 25.4;

// Lined paper, in mm.
/** Distance between rules. Also the text line height. */
export const RULE_PITCH_MM = 7;
/** Position of the first rule from the top edge. Text baselines sit on rules. */
export const RULE_TOP_MM = 20;
/** No rule closer than this to the bottom edge. */
export const RULE_BOTTOM_MM = 12;
/** Default position of the vertical margin line, from the left edge. A notebook setting. */
export const DEFAULT_MARGIN_MM = 20;
/** Gap between the margin line, a divider or the right edge and the text. */
export const TEXT_INSET_MM = 2;
/** Right edge inset for text. */
export const TEXT_RIGHT_INSET_MM = 6;

/** Canvas grid square. */
export const GRID_PITCH_MM = 5;

/** Excalifont line height as Excalidraw sets it. Font size = rule pitch / this. */
export const TEXT_LINE_HEIGHT = 1.25;

/** The grid above as a theme's lined metrics: the Ruled theme, and the default elsewhere. */
export const RULED_GRID: LinedMetrics = {
  pitchMm: RULE_PITCH_MM,
  firstRuleMm: RULE_TOP_MM,
  bottomMm: RULE_BOTTOM_MM,
  textInsetMm: TEXT_INSET_MM,
  rightInsetMm: TEXT_RIGHT_INSET_MM,
};

export function pageMm(
  size: PageSize,
  orientation: Orientation,
): { width: number; height: number } {
  const { width, height } = PAGE_SIZES_MM[size];
  return orientation === "portrait" ? { width, height } : { width: height, height: width };
}

/** Page dimensions in scene pixels at zoom 1. */
export interface PageGeometry {
  width: number;
  height: number;
}

export function pageGeometry(size: PageSize, orientation: Orientation): PageGeometry {
  const { width, height } = pageMm(size, orientation);
  return { width: width * SCENE_PX_PER_MM, height: height * SCENE_PX_PER_MM };
}

/** How many rules (text lines) fit on a page of the given height in mm. */
export function ruleCount(heightMm: number, grid: LinedMetrics = RULED_GRID): number {
  return Math.max(1, Math.floor((heightMm - grid.firstRuleMm - grid.bottomMm) / grid.pitchMm) + 1);
}

/** Divider position that halves the writable area between the margin line and the right edge. */
export function defaultDivider(widthMm: number, marginMm: number): number {
  return marginMm + (widthMm - marginMm) / 2;
}

/** The divider moves in steps of this many mm. */
export const DIVIDER_STEP_MM = 10;
/** Narrowest a column of text can be made by dragging the divider. */
export const MIN_COLUMN_MM = 20;

/**
 * Where a dragged divider lands: the nearest 10mm step from the left edge, kept far
 * enough from the margin line and the right edge for each column to hold some text.
 */
export function snapDivider(
  mm: number,
  widthMm: number,
  marginMm: number,
  grid: LinedMetrics = RULED_GRID,
): number {
  const min = marginMm + 2 * grid.textInsetMm + MIN_COLUMN_MM;
  const max = widthMm - grid.rightInsetMm - grid.textInsetMm - MIN_COLUMN_MM;
  const snapped = Math.round(mm / DIVIDER_STEP_MM) * DIVIDER_STEP_MM;
  return Math.min(Math.max(snapped, Math.ceil(min / DIVIDER_STEP_MM) * DIVIDER_STEP_MM), max);
}

/** Horizontal extent of each text column in mm: [left edge, width]. */
export function columnBoxes(
  widthMm: number,
  marginMm: number,
  divider: number | null,
  grid: LinedMetrics = RULED_GRID,
): { left: number; width: number }[] {
  const inset = grid.textInsetMm;
  const textLeft = marginMm + inset;
  const textRight = widthMm - grid.rightInsetMm;
  if (divider === null) return [{ left: textLeft, width: textRight - textLeft }];
  return [
    { left: textLeft, width: divider - inset - textLeft },
    { left: divider + inset, width: textRight - divider - inset },
  ];
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
