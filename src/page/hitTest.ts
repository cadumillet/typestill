// A hit test over a page's drawing, for the double-click that opens an element in
// drawing mode: the topmost element whose outline is within a tolerance of a point in
// scene px. Outlines, not bounding boxes, so a double-click on writing inside a drawn
// box still selects a word; a drawn text or image is hit anywhere in its box. Pure.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export interface ScenePoint {
  x: number;
  y: number;
}

/** How close to an outline a point must be, in scene px, for a stroke of the usual width. */
export const HIT_TOLERANCE = 6;

/** The tolerance for an element: wider for a thick stroke. */
export function toleranceFor(element: Pick<ExcalidrawElement, "strokeWidth">): number {
  return Math.max(HIT_TOLERANCE, element.strokeWidth / 2 + 4);
}

/** The distance from `p` to the segment `a`–`b`. */
function segmentDistance(p: ScenePoint, a: ScenePoint, b: ScenePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t =
    length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The distance from `p` to a closed or open polyline. */
function polylineDistance(p: ScenePoint, points: readonly ScenePoint[], closed: boolean): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y);
  let best = Infinity;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    best = Math.min(best, segmentDistance(p, points[i], points[(i + 1) % points.length]));
  }
  return best;
}

/**
 * The distance from `p` to the element's outline: the polyline of a line, arrow or
 * freedraw (its points offset by x, y); the edges of a rectangle or diamond; the outline
 * of an ellipse by the radial distance (the point's distance from the centre less the
 * outline's along the same ray); 0 anywhere inside a text or image box, which is hit
 * whole. Infinity for anything else.
 */
export function outlineDistance(element: ExcalidrawElement, p: ScenePoint): number {
  const { x, y, width, height } = element;
  switch (element.type) {
    case "line":
    case "arrow":
    case "freedraw":
      return polylineDistance(
        p,
        element.points.map(([px, py]) => ({ x: x + px, y: y + py })),
        false,
      );
    case "rectangle":
      return polylineDistance(
        p,
        [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ],
        true,
      );
    case "diamond":
      return polylineDistance(
        p,
        [
          { x: x + width / 2, y },
          { x: x + width, y: y + height / 2 },
          { x: x + width / 2, y: y + height },
          { x, y: y + height / 2 },
        ],
        true,
      );
    case "ellipse": {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const rx = width / 2;
      const ry = height / 2;
      if (rx === 0 || ry === 0) return Math.hypot(p.x - cx, p.y - cy);
      const t = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
      if (t === 0) return Math.min(rx, ry);
      return Math.hypot(p.x - cx, p.y - cy) * Math.abs(1 - 1 / t);
    }
    case "text":
    case "image":
      return p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + height ? 0 : Infinity;
    default:
      return Infinity;
  }
}

/**
 * The topmost element under `point`: the last one in element order (drawn on top) that
 * is not deleted and whose outline is within its tolerance of the point, or null.
 */
export function hitElement(
  elements: readonly ExcalidrawElement[],
  point: ScenePoint,
  tolerance: (element: ExcalidrawElement) => number = toleranceFor,
): ExcalidrawElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    if (element.isDeleted) continue;
    if (outlineDistance(element, point) <= tolerance(element)) return element;
  }
  return null;
}
