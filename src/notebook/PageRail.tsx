import { useEffect, useRef, useState, type PointerEvent } from "react";
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
  /** Distance from the top of the rail to the first square, so it aligns with the page. */
  offsetTop?: number;
  /** Rendered previews by page id, shown beside the hovered square when there is one. */
  thumbnails: Record<string, string>;
}

interface Hover {
  label: string;
  /** The hovered page, when the hover is a square rather than a tab. */
  pageIndex: number | null;
  /** Centre of the hovered square or tab, in px from the top of the rail. */
  top: number;
}

/** The tab's height plus the gap under it, which the squares sit below. */
const TAB_SPACE = 14;
/** Rough heights of the hover box, with and without a thumbnail, for keeping it in view. */
const HOVER_HEIGHT = 230;
const LABEL_HEIGHT = 26;
/** The thumbnail's outer corners, rounded like the page's; the inner edge stays square. */
const THUMBNAIL_CORNER = "4px";

/**
 * The left rail: one column per section, side by side in section order, each a tab in
 * the section's colour (its name on hover) over a stack of small squares, one per page
 * of the section in order, in the section's colour, the open page's ringed. Hovering a
 * square shows its label ("Page 7 · Work") and, once one has been rendered, a thumbnail
 * of the page; both float outside the scrolling lists so they are never clipped. A tab
 * opens the section where it was left. The rail holds nothing else: the page controls
 * are in the page bar.
 */
export function PageRail({
  sections,
  pages,
  index,
  sides,
  onSelect,
  onOpenSection,
  offsetTop = 0,
  thumbnails,
}: PageRailProps) {
  const rail = useRef<HTMLElement>(null);
  const current = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const runs = sectionRuns(sections, pages);

  // A page opened from elsewhere (the bar, a new page) may sit past the rail's edge.
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  }, [index, pages.length]);

  // The hover box is centred on the square, but kept inside the rail's height so a
  // thumbnail near the top or bottom is not cut off.
  const onEnter = (
    event: PointerEvent<HTMLButtonElement>,
    label: string,
    pageIndex: number | null,
  ) => {
    if (!rail.current) return;
    const target = event.currentTarget.getBoundingClientRect();
    const box = rail.current.getBoundingClientRect();
    const thumbnail = pageIndex !== null && thumbnails[pages[pageIndex].id];
    const half = (thumbnail ? HOVER_HEIGHT : LABEL_HEIGHT) / 2;
    const centre = target.top - box.top + target.height / 2;
    setHover({
      label,
      pageIndex,
      top: Math.min(Math.max(centre, half), Math.max(half, box.height - half)),
    });
  };

  const hoveredPage = hover && hover.pageIndex !== null ? pages[hover.pageIndex] : null;

  return (
    <nav
      className="page-rail"
      aria-label="Page rail"
      ref={rail}
      onPointerLeave={() => setHover(null)}
    >
      {runs.map(({ section, start, pages: own }) => (
        <div
          key={section.id}
          className="page-rail__column"
          style={{ paddingTop: Math.max(0, offsetTop - TAB_SPACE) }}
        >
          <button
            type="button"
            className="page-rail__tab"
            style={{ background: section.color }}
            aria-label={`Section ${section.name}`}
            onPointerEnter={(event) => onEnter(event, section.name, null)}
            onClick={() => onOpenSection(section.id)}
          />
          <ol className="page-rail__list" onScroll={() => setHover(null)}>
            {own.map((page, offset) => {
              const i = start + offset;
              return (
                <li key={page.id}>
                  <button
                    ref={i === index ? current : undefined}
                    type="button"
                    className="page-rail__square"
                    style={{ background: section.color }}
                    aria-label={`Page ${i + 1}, ${section.name}`}
                    aria-current={i === index ? "page" : undefined}
                    onPointerEnter={(event) => onEnter(event, `Page ${i + 1} · ${section.name}`, i)}
                    onClick={() => onSelect(i)}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      {hover && (
        <div className="page-rail__hover" style={{ top: hover.top }} aria-hidden>
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
