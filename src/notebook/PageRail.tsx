import { useEffect, useRef, useState, type PointerEvent } from "react";
import { IconButton } from "../shell/IconButton";
import { Menu } from "../shell/Menu";
import { Popover } from "../shell/Popover";
import { Filter, NewPage, Trash } from "../shell/icons";
import { pageSide } from "../page/sides";
import type { Page, PageKind, Tag } from "../store/model";
import { ADD_PAGE_HINT } from "./pageRules";
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
  /** Rendered previews by page id, shown beside the hovered square when there is one. */
  thumbnails: Record<string, string>;
  /** Whether a page may be added now (the one-page rule); off otherwise, with a hint. */
  canAdd: boolean;
  /** The tooltip of the add control when it is off. */
  addShortcut?: string;
  onAdd: (kind: PageKind) => void;
  /** Delete the open page: the caller asks first. */
  onDelete: () => void;
}

interface Hover {
  index: number;
  /** Centre of the hovered square, in px from the top of the rail. */
  top: number;
}

/** Room the filter button needs above the first square. */
const FILTER_HEIGHT = 40;
/** Rough heights of the hover box, with and without a thumbnail, for keeping it in view. */
const HOVER_HEIGHT = 230;
const LABEL_HEIGHT = 26;
/** The thumbnail's outer corners, rounded like the page's; the inner edge stays square. */
const THUMBNAIL_CORNER = "4px";

/** Closes the popover the way Menu does: through the outside pointerdown it listens for. */
const closePopovers = () => document.dispatchEvent(new PointerEvent("pointerdown"));

/**
 * The left rail: one small square per page in notebook order, coloured by the page's
 * tag, the open page highlighted. Filtering by tag only hides squares; page order and
 * numbering stay the same. Hovering a square shows its label and, once one has been
 * rendered, a thumbnail of the page; both float outside the scrolling list so they are
 * never clipped. Pinned under the squares: add a page (lined or zine) and delete the
 * open page.
 */
export function PageRail({
  pages,
  index,
  onSelect,
  offsetTop = 0,
  tags,
  filterTagId,
  onFilterChange,
  thumbnails,
  canAdd,
  addShortcut,
  onAdd,
  onDelete,
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

  // The hover box is centred on the square, but kept inside the rail's height so a
  // thumbnail near the top or bottom is not cut off.
  const onEnter = (event: PointerEvent<HTMLButtonElement>, i: number) => {
    if (!rail.current) return;
    const square = event.currentTarget.getBoundingClientRect();
    const box = rail.current.getBoundingClientRect();
    const half = (thumbnails[pages[i].id] ? HOVER_HEIGHT : LABEL_HEIGHT) / 2;
    const centre = square.top - box.top + square.height / 2;
    setHover({
      index: i,
      top: Math.min(Math.max(centre, half), Math.max(half, box.height - half)),
    });
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
      <div className="page-rail__controls">
        <Menu
          label="New page"
          shortcut={addShortcut}
          align="left"
          off={!canAdd}
          offReason={ADD_PAGE_HINT}
          items={[
            { label: "Lined page", onSelect: () => onAdd("lined") },
            { label: "Zine page", onSelect: () => onAdd("zine") },
          ]}
        >
          <NewPage />
        </Menu>
        <IconButton label="Delete page" onClick={onDelete}>
          <Trash />
        </IconButton>
      </div>
      {hover && (
        <div className="page-rail__hover" style={{ top: hover.top }} aria-hidden>
          <div className="page-rail__label">
            Page {hover.index + 1}
            {tagOf(pages[hover.index], tags) && ` · ${tagOf(pages[hover.index], tags)?.name}`}
          </div>
          {thumbnails[pages[hover.index].id] && (
            <img
              className="page-rail__thumbnail"
              src={thumbnails[pages[hover.index].id]}
              alt=""
              draggable={false}
              style={{
                borderRadius:
                  pageSide(hover.index) === "right"
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
