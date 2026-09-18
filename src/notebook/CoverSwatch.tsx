import type { ReactNode } from "react";
import { coverMark, type Cover } from "./cover";
import "./coverswatch.css";

export interface CoverSwatchProps {
  cover: Cover;
  name: string;
  /** Height in px; the swatch keeps a notebook's proportions unless `width` says otherwise. */
  size?: number;
  /** Width in px, for a cover drawn at a page's size (the overview). */
  width?: number;
  /** The mark's font size in px; by default a little over half the height. */
  markSize?: number;
  /** Anything drawn over the cover, such as the overview's name and subtitle. */
  children?: ReactNode;
}

/** The notebook's cover in miniature: its colour with the emoji or the name's initial. */
export function CoverSwatch({
  cover,
  name,
  size = 18,
  width = Math.round(size * 0.78),
  markSize = Math.round(size * 0.55),
  children,
}: CoverSwatchProps) {
  const mark = coverMark(cover, name);
  return (
    <span
      className="cover-swatch"
      style={{ background: cover.color, height: size, width }}
      aria-hidden="true"
    >
      {mark && (
        <span className="cover-swatch__mark" style={{ fontSize: markSize }}>
          {mark}
        </span>
      )}
      {children}
    </span>
  );
}
