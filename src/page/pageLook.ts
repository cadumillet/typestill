// The CSS custom properties a page sets from its theme, shared by every page kind.

import type { CSSProperties } from "react";
import type { Font, Theme } from "../theme/theme";
import { mmToCssPx } from "./paper";

/** Colours, corner and font of a page as custom properties for textpage.css. */
export function pageLookStyle(theme: Theme, font: Font, zoom: number): CSSProperties {
  return {
    "--page-paper": theme.colours.paper,
    "--page-ink": theme.colours.ink,
    "--page-rule": theme.colours.rule,
    "--page-margin": theme.colours.margin,
    "--page-divider": theme.colours.divider,
    "--page-corner": `${mmToCssPx(theme.page.cornerMm, zoom)}px`,
    "--page-font": `"${font.family}"`,
  } as CSSProperties;
}
