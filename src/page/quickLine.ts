// The quick line's arithmetic: a drag on the page in page px, its end snapped to 15°
// steps from its start as Excalidraw's Shift does, and the line in scene px for the
// element it becomes. Pure; the hook (useQuickLine.ts) and the element builder
// (quickLineElement.ts) use it.

export interface Point {
  x: number;
  y: number;
}

/** A line in scene px: its start and its run, as an Excalidraw line's x, y and points. */
export interface QuickLine {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Excalidraw's Shift snapping: the angle steps a line can take. */
export const SNAP_STEP_DEG = 15;
/** A drag shorter than this, in page px, is a click and draws nothing. */
export const DEAD_ZONE_PX = 4;

/**
 * The end of a line from `start` towards `end`, turned to the nearest multiple of 15°
 * at the same length. A zero-length drag stays where it is.
 */
export function snapTo15(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { ...end };
  const step = (SNAP_STEP_DEG * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
}

/** Whether a drag from `start` to `end` is long enough to be a line. */
export function isDrag(start: Point, end: Point): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) >= DEAD_ZONE_PX;
}

/**
 * A drag in page px (from the page's padding-box origin, where scene (0, 0) is) as a line
 * in scene px at `zoom` CSS px per scene px, the end already snapped: page px over zoom.
 */
export function toScene(start: Point, end: Point, zoom: number): QuickLine {
  return {
    x: start.x / zoom,
    y: start.y / zoom,
    dx: (end.x - start.x) / zoom,
    dy: (end.y - start.y) / zoom,
  };
}
