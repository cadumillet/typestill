// The CSS custom properties a page sets from its theme, shared by every page kind.

import type { CSSProperties } from "react";
import type { Font, Theme } from "../theme/theme";
import { isDarkTheme } from "../theme/themes";
import { TINTS } from "./document";
import { mmToCssPx } from "./paper";

/**
 * Colours, corner, fonts and highlight tints of a page as custom properties for
 * textpage.css: `font` is the page's text font; the page number is always in the lined
 * font. Highlights multiply over light paper and sit translucent over dark paper.
 */
export function pageLookStyle(theme: Theme, font: Font, zoom: number): CSSProperties {
  return {
    ...Object.fromEntries(
      TINTS.map((tint) => [`--page-highlight-${tint}`, theme.highlights[tint]]),
    ),
    "--page-highlight-blend": isDarkTheme(theme) ? "normal" : "multiply",
    "--page-paper": theme.colours.paper,
    "--page-ink": theme.colours.ink,
    "--page-rule": theme.colours.rule,
    "--page-margin": theme.colours.margin,
    "--page-divider": theme.colours.divider,
    "--page-corner": `${mmToCssPx(theme.page.cornerMm, zoom)}px`,
    "--page-font": `"${font.family}"`,
    "--page-mark-font": `"${theme.lined.font.family}"`,
  } as CSSProperties;
}
