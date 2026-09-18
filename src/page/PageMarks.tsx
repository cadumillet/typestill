import type { CSSProperties } from "react";
import { mmToCssPx } from "./paper";
import "./pagemarks.css";

export interface PageMarksProps {
  /** The date stamp, top right, or null for none. */
  date: Date | null;
  /** The page number, bottom centre, or null for none. */
  number: number | null;
  /** CSS px per scene px, as the page's. */
  zoom: number;
}

/** Position of the date stamp's baseline area from the top, and of the number from the bottom. */
const DATE_TOP_MM = 6;
const DATE_RIGHT_MM = 6;
const NUMBER_BOTTOM_MM = 4;
const MARK_SIZE_MM = 3.2;

/** "September 16, 2026" */
export function formatStamp(date: Date): string {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * The page's date stamp and page number: overlays in the page's own font, part of the
 * page element so thumbnails and exports carry them. Neither takes any pointer events.
 */
export function PageMarks({ date, number, zoom }: PageMarksProps) {
  const px = (value: number) => mmToCssPx(value, zoom);
  const style = { "--mark-size": `${px(MARK_SIZE_MM)}px` } as CSSProperties;
  return (
    <>
      {date && (
        <div
          className="page-marks__date"
          style={{ ...style, top: px(DATE_TOP_MM), right: px(DATE_RIGHT_MM) }}
        >
          {formatStamp(date)}
        </div>
      )}
      {number !== null && (
        <div className="page-marks__number" style={{ ...style, bottom: px(NUMBER_BOTTOM_MM) }}>
          {number}
        </div>
      )}
    </>
  );
}
