import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Page } from "../store/model";
import "./pagerail.css";

export interface PageRailProps {
  pages: Page[];
  /** Index of the page shown. */
  index: number;
  onSelect: (index: number) => void;
  /** Distance from the top of the rail to the first square, so it aligns with the page. */
  offsetTop?: number;
}

interface Hover {
  index: number;
  /** Centre of the hovered square, in px from the top of the rail. */
  top: number;
}

/**
 * The left rail: one small square per page in notebook order, the open page highlighted.
 * The hover label floats outside the scrolling list so it is never clipped; the hover
 * preview of Phase 2 will hang off the same anchor. Tags will colour the squares.
 */
export function PageRail({ pages, index, onSelect, offsetTop = 0 }: PageRailProps) {
  const rail = useRef<HTMLElement>(null);
  const current = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  // A page opened from elsewhere (the bar, a new page) may sit past the rail's edge.
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  }, [index, pages.length]);

  const onEnter = (event: PointerEvent<HTMLButtonElement>, i: number) => {
    if (!rail.current) return;
    const square = event.currentTarget.getBoundingClientRect();
    const box = rail.current.getBoundingClientRect();
    setHover({ index: i, top: square.top - box.top + square.height / 2 });
  };

  return (
    <nav className="page-rail" aria-label="Page rail" ref={rail}>
      <ol
        className="page-rail__list"
        style={{ paddingTop: offsetTop }}
        onPointerLeave={() => setHover(null)}
        onScroll={() => setHover(null)}
      >
        {pages.map((page, i) => (
          <li key={page.id}>
            <button
              ref={i === index ? current : undefined}
              type="button"
              className="page-rail__square"
              aria-label={`Page ${i + 1}`}
              aria-current={i === index ? "page" : undefined}
              onPointerEnter={(event) => onEnter(event, i)}
              onClick={() => onSelect(i)}
            />
          </li>
        ))}
      </ol>
      {hover && (
        <div className="page-rail__label" style={{ top: hover.top }} aria-hidden>
          Page {hover.index + 1}
        </div>
      )}
    </nav>
  );
}
