// The notebook cover: what a notebook looks like when closed. A colour from a small
// palette, an optional emoji, and an optional subtitle; the name is the notebook's own.
// Shown as a swatch next to the name in the app bar and the switcher, and as a card on
// the shelf. Stored on the notebook and included in backups.

export interface Cover {
  /** A CSS colour, normally one of COVER_COLORS. */
  color: string;
  /** One emoji shown on the cover, or null for the name's initial. */
  emoji: string | null;
  subtitle: string | null;
}

export interface CoverColor {
  name: string;
  value: string;
}

/** Classic notebook colours. All dark enough for white lettering. */
export const COVER_COLORS: readonly CoverColor[] = [
  { name: "Black", value: "#2b2a27" },
  { name: "Red", value: "#b8342c" },
  { name: "Orange", value: "#d2691e" },
  { name: "Olive", value: "#6b7a2b" },
  { name: "Green", value: "#2e7d4f" },
  { name: "Blue", value: "#2f5b9e" },
  { name: "Purple", value: "#6a4c9c" },
  { name: "Brown", value: "#7a5230" },
];

export const DEFAULT_COVER: Cover = { color: COVER_COLORS[0].value, emoji: null, subtitle: null };

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

/** Whether a value is a stored cover. */
export function isCover(value: unknown): value is Cover {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const cover = value as Record<string, unknown>;
  return (
    typeof cover.color === "string" &&
    cover.color.length > 0 &&
    isNullableString(cover.emoji) &&
    isNullableString(cover.subtitle)
  );
}

/** The first user-perceived character of a string: one emoji, however many code points. */
export function firstGrapheme(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed);
    for (const segment of segments) return segment.segment;
  }
  return [...trimmed][0];
}

/** What the cover shows: its emoji, else the name's initial, else nothing. */
export function coverMark(cover: Cover, name: string): string {
  if (cover.emoji) return cover.emoji;
  return firstGrapheme(name).toUpperCase();
}

/** A cover from form fields: blank emoji and subtitle become null, the emoji is one grapheme. */
export function coverFromFields(fields: { color: string; emoji: string; subtitle: string }): Cover {
  const emoji = firstGrapheme(fields.emoji);
  const subtitle = fields.subtitle.trim();
  return {
    color: fields.color,
    emoji: emoji === "" ? null : emoji,
    subtitle: subtitle === "" ? null : subtitle,
  };
}
