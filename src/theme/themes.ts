// The built-in themes. Ruled is the notebook's original look; Plain is a monospaced
// typeface on the same grid with nothing drawn; Dark is Ruled on dark paper.

import { HIGHLIGHT_COLORS } from "../canvas/palette";
import { DEFAULT_MARGIN_MM, RULED_GRID, TEXT_LINE_HEIGHT } from "../page/paper";
import { DEFAULT_ZINE_PADDING_MM, DEFAULT_ZINE_TEXT_ROWS } from "../page/zine";
import type { Font, Theme } from "./theme";

/** Excalidraw's handwriting font, subset files written by scripts/copy-fonts.mjs. */
export const EXCALIFONT: Font = {
  family: "Excalifont",
  source: "bundled",
  lineHeight: TEXT_LINE_HEIGHT,
  weights: [400],
};

/** A clean sans for zine text, from Excalidraw's bundle. */
export const ASSISTANT: Font = {
  family: "Assistant",
  source: "bundled",
  lineHeight: 1.25,
  weights: [400, 700],
};

/** Cascadia Code, the monospaced face Excalidraw ships. */
export const CASCADIA: Font = {
  family: "Cascadia Code",
  source: "bundled",
  lineHeight: 1.3,
  weights: [400],
};

const grid = { ...RULED_GRID, defaultMarginMm: DEFAULT_MARGIN_MM };

const zineDefaults = {
  font: ASSISTANT,
  defaultPaddingMm: DEFAULT_ZINE_PADDING_MM,
  defaultTextRows: DEFAULT_ZINE_TEXT_ROWS,
};

export const RULED: Theme = {
  id: "ruled",
  name: "Ruled",
  lined: { ...grid, font: EXCALIFONT, rules: "lines", marginLine: true },
  zine: zineDefaults,
  colours: {
    paper: "#ffffff",
    ink: "#26241f",
    rule: "#c7d3e3",
    margin: "#f0b4b4",
    divider: "#dedede",
  },
  highlights: HIGHLIGHT_COLORS,
  page: { border: true, cornerMm: 3 },
};

export const PLAIN: Theme = {
  id: "plain",
  name: "Plain",
  lined: { ...grid, font: CASCADIA, rules: "none", marginLine: false },
  zine: zineDefaults,
  colours: {
    paper: "#ffffff",
    ink: "#26241f",
    rule: "#e4e2dc",
    margin: "#e4e2dc",
    divider: "#dedede",
  },
  highlights: HIGHLIGHT_COLORS,
  page: { border: true, cornerMm: 3 },
};

/**
 * Dark paper, light ink, dimmed rules and margin line; the same five colour picks. The
 * highlights are translucent (open-color shade 6 at 40%), since multiplying a tint over
 * dark paper would leave nothing to see.
 */
export const DARK: Theme = {
  id: "dark",
  name: "Dark",
  lined: { ...grid, font: EXCALIFONT, rules: "lines", marginLine: true },
  zine: zineDefaults,
  colours: {
    paper: "#1e1d1a",
    ink: "#e8e5dd",
    rule: "#383b42",
    margin: "#5c3a3a",
    divider: "#3a3936",
  },
  highlights: {
    yellow: "rgb(250 176 5 / 0.4)",
    green: "rgb(64 192 87 / 0.4)",
    blue: "rgb(51 154 240 / 0.4)",
    pink: "rgb(240 101 149 / 0.4)",
  },
  page: { border: true, cornerMm: 3 },
};

export const THEMES: readonly Theme[] = [RULED, PLAIN, DARK];

/** Whether a theme's paper is dark, so the app can suggest the dark appearance. */
export function isDarkTheme(theme: Theme): boolean {
  const hex = theme.colours.paper.replace("#", "");
  if (hex.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export const DEFAULT_THEME_ID = RULED.id;

/** The theme a notebook references, or Ruled for an id that no longer exists. */
export function getTheme(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? RULED;
}
