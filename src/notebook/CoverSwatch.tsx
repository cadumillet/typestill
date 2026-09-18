import { coverMark, type Cover } from "./cover";
import "./coverswatch.css";

export interface CoverSwatchProps {
  cover: Cover;
  name: string;
  /** Height in px; the swatch keeps a notebook's proportions. */
  size?: number;
}

/** The notebook's cover in miniature: its colour with the emoji or the name's initial. */
export function CoverSwatch({ cover, name, size = 18 }: CoverSwatchProps) {
  const mark = coverMark(cover, name);
  return (
    <span
      className="cover-swatch"
      style={{ background: cover.color, height: size, width: Math.round(size * 0.78) }}
      aria-hidden="true"
    >
      {mark && (
        <span className="cover-swatch__mark" style={{ fontSize: Math.round(size * 0.55) }}>
          {mark}
        </span>
      )}
    </span>
  );
}
