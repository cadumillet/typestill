// The built-in themes. Ruled is the notebook's original look; Plain is a monospaced
// typeface on the same grid with nothing drawn.

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
  page: { border: true, cornerMm: 3 },
};

export const THEMES: readonly Theme[] = [RULED, PLAIN];

export const DEFAULT_THEME_ID = RULED.id;

/** The theme a notebook references, or Ruled for an id that no longer exists. */
export function getTheme(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? RULED;
}
