// The quick line's arithmetic: a drag on the page in page px, the element it draws
// (a line by default; Option cycles through rectangle, ellipse and arrow while Shift is
// held), the box a rectangle or ellipse takes from the drag, and the line in scene px
// for the element it becomes. Pure; the hook (useQuickLine.ts) and the element builder
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

/** What a quick drag draws. The order is the round robin Option steps through. */
export const QUICK_ELEMENTS = ["line", "rectangle", "ellipse", "arrow"] as const;
export type QuickElement = (typeof QUICK_ELEMENTS)[number];

/** The element after `element` in the round robin: line, rectangle, ellipse, arrow, line. */
export function nextElement(element: QuickElement): QuickElement {
  return QUICK_ELEMENTS[(QUICK_ELEMENTS.indexOf(element) + 1) % QUICK_ELEMENTS.length];
}

/** A box in page or scene px: its min corner and its size, never negative. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The bounding box of a drag's start and end: the min corner and the absolute size. */
export function boxOf(start: Point, end: Point): Box {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/** Whether a box from a drag is drawn: it clears the dead zone in at least one direction. */
export function isBoxDrag(start: Point, end: Point): boolean {
  const box = boxOf(start, end);
  return box.width >= DEAD_ZONE_PX || box.height >= DEAD_ZONE_PX;
}

/** A box in page px as one in scene px at `zoom` CSS px per scene px. */
export function toSceneBox(start: Point, end: Point, zoom: number): Box {
  const box = boxOf(start, end);
  return { x: box.x / zoom, y: box.y / zoom, width: box.width / zoom, height: box.height / zoom };
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
