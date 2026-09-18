import type { CSSProperties } from "react";
import { mmToCssPx } from "./paper";
import "./pagemarks.css";

export interface PageMarksProps {
  /** The page number, bottom centre, or null for none. */
  number: number | null;
  /** CSS px per scene px, as the page's. */
  zoom: number;
}

/** Position of the number from the bottom edge, and its size. */
const NUMBER_BOTTOM_MM = 4;
const MARK_SIZE_MM = 3.2;

/**
 * The page number: an element inside the page in the lined font and ink, on every page
 * kind, so thumbnails and exports carry it. It takes no pointer events.
 */
export function PageMarks({ number, zoom }: PageMarksProps) {
  if (number === null) return null;
  const px = (value: number) => mmToCssPx(value, zoom);
  const style = {
    "--mark-size": `${px(MARK_SIZE_MM)}px`,
    bottom: px(NUMBER_BOTTOM_MM),
  } as CSSProperties;
  return (
    <div className="page-marks__number" style={style}>
      {number}
    </div>
  );
}
