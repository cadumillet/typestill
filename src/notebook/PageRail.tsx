import { useEffect, useRef, useState, type PointerEvent } from "react";
import { IconButton } from "../shell/IconButton";
import { Popover } from "../shell/Popover";
import { Filter } from "../shell/icons";
import type { Page, Tag } from "../store/model";
import { passesFilter, tagOf } from "./tags";
import "./pagerail.css";

export interface PageRailProps {
  pages: Page[];
  /** Index of the page shown. */
  index: number;
  onSelect: (index: number) => void;
  /** Distance from the top of the rail to the first square, so it aligns with the page. */
  offsetTop?: number;
  /** The notebook's tags: they colour the squares and are the filter's choices. */
  tags: readonly Tag[];
  /** Only pages with this tag are shown; null shows every page. */
  filterTagId: string | null;
  onFilterChange: (tagId: string | null) => void;
}

interface Hover {
  index: number;
  /** Centre of the hovered square, in px from the top of the rail. */
  top: number;
}

/** Room the filter button needs above the first square. */
const FILTER_HEIGHT = 40;

/** Closes the popover the way Menu does: through the outside pointerdown it listens for. */
const closePopovers = () => document.dispatchEvent(new PointerEvent("pointerdown"));

/**
 * The left rail: one small square per page in notebook order, coloured by the page's
 * tag, the open page highlighted. Filtering by tag only hides squares; page order and
 * numbering stay the same. The hover label floats outside the scrolling list so it is
 * never clipped; the hover preview of Phase 2 will hang off the same anchor.
 */
export function PageRail({
  pages,
  index,
  onSelect,
  offsetTop = 0,
  tags,
  filterTagId,
  onFilterChange,
}: PageRailProps) {
  const rail = useRef<HTMLElement>(null);
  const current = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  // A filter whose tag was deleted shows nothing; treat it as no filter.
  const filter = tags.some((tag) => tag.id === filterTagId) ? filterTagId : null;
  const filterTag = tags.find((tag) => tag.id === filter);

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
      {tags.length > 0 && (
        <div className="page-rail__filter">
          <Popover
            align="left"
            trigger={({ open, toggle, controls }) => (
              <IconButton
                label={filterTag ? `Filtered: ${filterTag.name}` : "Filter by tag"}
                pressed={filter !== null}
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={controls}
                className="page-rail__filter-button"
                style={filterTag ? { color: filterTag.color } : undefined}
              >
                <Filter />
              </IconButton>
            )}
          >
            <ul className="menu__list" role="menu" aria-label="Filter by tag">
              <li role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={filter === null}
                  className="menu__item page-rail__filter-item"
                  onClick={() => {
                    closePopovers();
                    onFilterChange(null);
                  }}
                >
                  <span className="page-rail__dot page-rail__dot--none" />
                  All pages
                </button>
              </li>
              {tags.map((tag) => (
                <li key={tag.id} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={filter === tag.id}
                    className="menu__item page-rail__filter-item"
                    onClick={() => {
                      closePopovers();
                      onFilterChange(tag.id);
                    }}
                  >
                    <span className="page-rail__dot" style={{ background: tag.color }} />
                    {tag.name}
                  </button>
                </li>
              ))}
            </ul>
          </Popover>
        </div>
      )}
      <ol
        className="page-rail__list"
        style={{ paddingTop: tags.length > 0 ? Math.max(offsetTop, FILTER_HEIGHT) : offsetTop }}
        onPointerLeave={() => setHover(null)}
        onScroll={() => setHover(null)}
      >
        {pages.map((page, i) => {
          if (!passesFilter(page, filter)) return null;
          const tag = tagOf(page, tags);
          return (
            <li key={page.id}>
              <button
                ref={i === index ? current : undefined}
                type="button"
                className={`page-rail__square${tag ? " has-tag" : ""}`}
                style={tag ? { background: tag.color } : undefined}
                aria-label={tag ? `Page ${i + 1}, ${tag.name}` : `Page ${i + 1}`}
                aria-current={i === index ? "page" : undefined}
                onPointerEnter={(event) => onEnter(event, i)}
                onClick={() => onSelect(i)}
              />
            </li>
          );
        })}
      </ol>
      {hover && (
        <div className="page-rail__label" style={{ top: hover.top }} aria-hidden>
          Page {hover.index + 1}
          {tagOf(pages[hover.index], tags) && ` · ${tagOf(pages[hover.index], tags)?.name}`}
        </div>
      )}
    </nav>
  );
}
