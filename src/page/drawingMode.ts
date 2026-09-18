// Drawing mode's per-browser state: whether the mode is on (kept for the tab's session)
// and the viewing aids, the opacity of the text and of the rules while drawing. None of
// it is stored with the page or applied to exports.

import type { CSSProperties } from "react";

export type Opacity = "full" | "dimmed" | "hidden";

export const OPACITIES: readonly Opacity[] = ["full", "dimmed", "hidden"];

/** What each setting does to the text or the rules in drawing mode. */
export const OPACITY_VALUES: Record<Opacity, number> = { full: 1, dimmed: 0.3, hidden: 0 };

/** The viewing aids of drawing mode. */
export interface DrawingAids {
  text: Opacity;
  rules: Opacity;
}

/** The aids as the page's custom properties, read by textpage.css under `.is-drawing`. */
export function drawingModeStyle(aids: DrawingAids): CSSProperties {
  return {
    "--page-text-opacity": OPACITY_VALUES[aids.text],
    "--page-rules-opacity": OPACITY_VALUES[aids.rules],
  } as CSSProperties;
}

const MODE_KEY = "typestill.drawing.mode";
const AIDS_KEY = "typestill.drawing.aids";

const isOpacity = (value: unknown): value is Opacity =>
  typeof value === "string" && (OPACITIES as readonly string[]).includes(value);

/** Whether the tab was left in drawing mode. */
export function readDrawingMode(): boolean {
  try {
    return sessionStorage.getItem(MODE_KEY) === "on";
  } catch {
    return false;
  }
}

export function storeDrawingMode(on: boolean): void {
  try {
    sessionStorage.setItem(MODE_KEY, on ? "on" : "off");
  } catch {
    // Browser storage is a convenience only.
  }
}

export function readDrawingAids(): DrawingAids {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(AIDS_KEY) ?? "null");
    if (typeof raw === "object" && raw !== null) {
      const { text, rules } = raw as Record<string, unknown>;
      return { text: isOpacity(text) ? text : "full", rules: isOpacity(rules) ? rules : "full" };
    }
  } catch {
    // Fall through to the defaults.
  }
  return { text: "full", rules: "full" };
}

export function storeDrawingAids(aids: DrawingAids): void {
  try {
    localStorage.setItem(AIDS_KEY, JSON.stringify(aids));
  } catch {
    // Browser storage is a convenience only.
  }
}
