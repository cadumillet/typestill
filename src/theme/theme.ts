// A theme is the look of the pages and nothing else: the fonts, the line grid, the
// rules and margin line, the colours, the zine defaults. The app's chrome is not themed.
// Every notebook references one theme by id. Built-in themes are code (themes.ts);
// custom themes, stored with the notebook, come later.

import type { Tint } from "../page/document";

export type RuleStyle = "lines" | "dots" | "none";

export interface Font {
  /** The CSS font family. */
  family: string;
  /** A font shipped with the app, or (later) a file in the notebook. */
  source: "bundled" | "file";
  fileId?: string;
  /** Unitless line height; the font size is the pitch divided by it. */
  lineHeight: number;
  /** Real weights the font has. Bold is synthetic when 700 is missing. */
  weights?: number[];
}

/** The line grid of lined pages. Text sits on it whether the rules are drawn or not. */
export interface LinedMetrics {
  /** Distance between rules, and the text line height, in mm. */
  pitchMm: number;
  /** The first rule, from the top edge. */
  firstRuleMm: number;
  /** No rule closer than this to the bottom edge. */
  bottomMm: number;
  /** Gap between the margin line, a divider or the right edge and the text. */
  textInsetMm: number;
  /** Right edge inset for text. */
  rightInsetMm: number;
}

export interface Theme {
  id: string;
  name: string;
  lined: LinedMetrics & {
    font: Font;
    rules: RuleStyle;
    marginLine: boolean;
    /** Margin line offset for a new notebook's pages, in mm. */
    defaultMarginMm: number;
  };
  zine: {
    font: Font;
    defaultPaddingMm: number;
    defaultTextRows: number;
  };
  colours: {
    paper: string;
    ink: string;
    rule: string;
    margin: string;
    divider: string;
  };
  /** The highlight tints' colours on this paper: multiplied over light paper, translucent over dark. */
  highlights: Record<Tint, string>;
  page: {
    border: boolean;
    cornerMm: number;
  };
}
