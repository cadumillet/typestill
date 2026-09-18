import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { pageSide, type Side } from "../page/sides";
import type { Page, Section } from "../store/model";
import { sectionRuns } from "./sections";
import "./pagerail.css";

export interface PageRailProps {
  /** The notebook's sections, in order: one column each. */
  sections: readonly Section[];
  /** The pages in notebook order (section order, then creation order). */
  pages: readonly Page[];
  /** Index of the page shown. */
  index: number;
  /** The notebook's sides, for rounding a thumbnail's outer corners. */
  sides: readonly Side[];
  onSelect: (index: number) => void;
  /** A section's tab was clicked: open the section where it was left. */
  onOpenSection: (sectionId: string) => void;
  /** Rendered previews by page id, shown beside the hovered square when there is one. */
  thumbnails: Record<string, string>;
}

interface Hover {
  label: string;
  /** The hovered page, when the hover is a square rather than a tab. */
  pageIndex: number | null;
  /** Where the hover box goes, in px from the map's top-left corner. */
  top: number;
  left: number;
}

/** Rough heights of the hover box, with and without a thumbnail, for keeping it in view. */
const HOVER_HEIGHT = 230;
const LABEL_HEIGHT = 26;
/** The thumbnail's outer corners, rounded like the page's; the inner edge stays square. */
const THUMBNAIL_CORNER = "4px";

/**
 * The notebook's map, in the notebook box: one column per section, side by side in
 * section order, each a tab in the section's colour with its name over a stack of small
 * squares, one per page of the section in order, the open page's in the section's colour
 * and the others in a light tint of it. Hovering a square shows its label ("Page 7 ·
 * Work") and, once one has been rendered, a thumbnail of the page. A square opens the
 * page and a tab opens the section where it was left; the box closes on either.
 */
export function PageRail({
  sections,
  pages,
  index,
  sides,
  onSelect,
  onOpenSection,
  thumbnails,
}: PageRailProps) {
  const map = useRef<HTMLElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const runs = sectionRuns(sections, pages);

  // The hover box sits to the right of the square, centred on it but kept inside the
  // map's height so a thumbnail near the top or bottom is not cut off.
  const onEnter = (
    event: PointerEvent<HTMLButtonElement>,
    label: string,
    pageIndex: number | null,
  ) => {
    if (!map.current) return;
    const target = event.currentTarget.getBoundingClientRect();
    const box = map.current.getBoundingClientRect();
    const thumbnail = pageIndex !== null && thumbnails[pages[pageIndex].id];
    const half = (thumbnail ? HOVER_HEIGHT : LABEL_HEIGHT) / 2;
    const centre = target.top - box.top + target.height / 2;
    setHover({
      label,
      pageIndex,
      top: Math.min(Math.max(centre, half), Math.max(half, box.height - half)),
      left: target.right - box.left + 8,
    });
  };

  const hoveredPage = hover && hover.pageIndex !== null ? pages[hover.pageIndex] : null;

  return (
    <nav className="page-rail" aria-label="Notebook map" ref={map}>
      <div className="page-rail__columns" onPointerLeave={() => setHover(null)}>
        {runs.map(({ section, start, pages: own }) => (
          <div
            key={section.id}
            className="page-rail__column"
            style={{ "--section": section.color } as CSSProperties}
          >
            <button
              type="button"
              className="page-rail__tab"
              onPointerEnter={(event) => onEnter(event, section.name, null)}
              onClick={() => onOpenSection(section.id)}
            >
              {section.name}
            </button>
            <ol className="page-rail__list">
              {own.map((page, offset) => {
                const i = start + offset;
                return (
                  <li key={page.id}>
                    <button
                      type="button"
                      className="page-rail__square"
                      aria-label={`Page ${i + 1}, ${section.name}`}
                      aria-current={i === index ? "page" : undefined}
                      onPointerEnter={(event) =>
                        onEnter(event, `Page ${i + 1} · ${section.name}`, i)
                      }
                      onClick={() => onSelect(i)}
                    />
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      {hover && (
        <div className="page-rail__hover" style={{ top: hover.top, left: hover.left }} aria-hidden>
          <div className="page-rail__label">{hover.label}</div>
          {hoveredPage && thumbnails[hoveredPage.id] && (
            <img
              className="page-rail__thumbnail"
              src={thumbnails[hoveredPage.id]}
              alt=""
              draggable={false}
              style={{
                borderRadius:
                  pageSide(sides, hover.pageIndex!) === "right"
                    ? `0 ${THUMBNAIL_CORNER} ${THUMBNAIL_CORNER} 0`
                    : `${THUMBNAIL_CORNER} 0 0 ${THUMBNAIL_CORNER}`,
              }}
            />
          )}
        </div>
      )}
    </nav>
  );
}
