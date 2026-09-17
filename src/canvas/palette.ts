// The colour palette shared by the page and the canvas: Excalidraw's default stroke picks
// (open-color shade 8 of red, green, blue and yellow, plus its black). Excalidraw shows
// them as the first row of its stroke colour picker; the page's format bar shows the same
// swatches, so text and drawings use the same handful of colours.

export interface InkColor {
  name: string;
  /** CSS colour, or null for the page's default ink. */
  value: string | null;
}

export const INK_COLORS: readonly InkColor[] = [
  { name: "Black", value: null },
  { name: "Red", value: "#e03131" },
  { name: "Green", value: "#2f9e44" },
  { name: "Blue", value: "#1971c2" },
  { name: "Yellow", value: "#f08c00" },
];

/**
 * The palette colour a CSS colour value names, as its hex, or null when it is not in the
 * palette. Browsers report inline styles as rgb(), so those are read as well as hex.
 */
export function inkColorOf(value: string): string | null {
  const hex = toHex(value);
  return hex && INK_COLORS.some((color) => color.value === hex) ? hex : null;
}

function toHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return "#" + [...v.slice(1)].map((c) => c + c).join("");
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  if (!rgb) return null;
  return (
    "#" +
    rgb
      .slice(1, 4)
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}
