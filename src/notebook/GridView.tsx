import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { pageSide } from "../page/sides";
import { SHEET, type Page, type Section } from "../store/model";
import { fillShade } from "./fill";
import { sectionIndexOf } from "./sections";
import "./gridview.css";

export interface GridViewProps {
  /** The notebook's pages in position order. */
  pages: readonly Page[];
  /** Index of the open page (kept for assistive technology; nothing marks it). */
  index: number;
  sections: readonly Section[];
  size: number;
  /** Rendered previews by page id, shown beside the hovered square when there is one. */
  thumbnails: Record<string, string>;
  /** A square: opens the page (the caller closes the view). */
  onSelect: (index: number) => void;
  /** A section's name: opens the section where it was left (the caller closes the view). */
  onOpenSection: (sectionId: string) => void;
  onClose: () => void;
}

interface Hover {
  index: number;
  /** Where the hover box goes, in px from the grid's top-left corner. */
  top: number;
  left: number;
}

/** GitHub's graph: a square's side and the gap between squares, both ways, in px. */
export const SQUARE = 10;
export const GAP = 3;
/** The pitch from one sheet's left edge to the next's. */
const PITCH = SQUARE + GAP;
/** The least room between two section names before the later one is left out. */
const NAME_GAP = 8;
/** Rough heights of the hover box, with and without a thumbnail, for keeping it in view. */
const HOVER_HEIGHT = 230;
const LABEL_HEIGHT = 26;
const THUMBNAIL_CORNER = "4px";

/**
 * The grid view: the whole notebook at a glance, over the desk, drawn as GitHub draws a
 * year. One column per sheet, four squares tall, read down each column then across;
 * a square's shade is the page's fill in its section's colour, and nothing marks the open
 * page. Section names sit above their first column in the section's colour, as the
 * month labels do, and open the section where it was left; a name that would run into
 * the one before it is left out, as a short month's is. Hovering a square shows "Page 7
 * · Work" and the page's thumbnail; a click opens the page. Escape closes the view. The
 * grid edits nothing: sections are edited in the notebook box.
 */
export function GridView({
  pages,
  index,
  sections,
  size,
  thumbnails,
  onSelect,
  onOpenSection,
  onClose,
}: GridViewProps) {
  const grid = useRef<HTMLDivElement>(null);
  const names = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  /** Ids of the sections whose name is left out for want of room. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const sheets = size / SHEET;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Names are laid out left to right at their column; one that would overlap the last
  // shown name is left out. Measured after every render of the names, since a rename or
  // a moved cut changes the fit.
  useLayoutEffect(() => {
    const row = names.current;
    if (!row) return;
    const next = new Set<string>();
    let right = -Infinity;
    for (const element of row.querySelectorAll<HTMLElement>(".grid-view__name")) {
      const left = element.offsetLeft;
      if (left < right + NAME_GAP) {
        next.add(element.dataset.section!);
      } else {
        right = left + element.offsetWidth;
      }
    }
    setHidden((current) =>
      current.size === next.size && [...next].every((id) => current.has(id)) ? current : next,
    );
  }, [sections, size]);

  // The hover box sits to the right of the square, centred on it but kept inside the
  // grid's height so a thumbnail near the top or bottom is not cut off.
  const onEnter = (event: PointerEvent<HTMLButtonElement>, i: number) => {
    if (!grid.current) return;
    const target = event.currentTarget.getBoundingClientRect();
    const box = grid.current.getBoundingClientRect();
    const half = (thumbnails[pages[i].id] ? HOVER_HEIGHT : LABEL_HEIGHT) / 2;
    const centre = target.top - box.top + target.height / 2;
    setHover({
      index: i,
      top: Math.min(Math.max(centre, half), Math.max(half, box.height - half)),
      left: target.right - box.left + 8,
    });
  };

  const hovered = hover ? pages[hover.index] : null;
  const sectionName = (position: number) => sections[sectionIndexOf(sections, position)].name;

  return (
    <div className="grid-view" role="dialog" aria-label="Notebook grid">
      <div className="grid-view__grid" ref={grid}>
        <div className="grid-view__names" ref={names}>
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`grid-view__name${hidden.has(section.id) ? " is-hidden" : ""}`}
              data-section={section.id}
              style={{ left: (section.start / SHEET) * PITCH, color: section.color }}
              title={`Open ${section.name} where it was left`}
              tabIndex={hidden.has(section.id) ? -1 : undefined}
              onClick={() => onOpenSection(section.id)}
            >
              {section.name}
            </button>
          ))}
        </div>
        <div className="grid-view__sheets" onPointerLeave={() => setHover(null)}>
          {Array.from({ length: sheets }, (_, sheet) => {
            const start = sheet * SHEET;
            const section = sections[sectionIndexOf(sections, start)];
            return (
              <div key={sheet} className="grid-view__sheet">
                {Array.from({ length: SHEET }, (_, row) => {
                  const i = start + row;
                  const page = pages[i];
                  if (!page) return null;
                  return (
                    <button
                      key={page.id}
                      type="button"
                      className={`grid-view__square is-${fillShade(page.fill)}`}
                      style={{ "--section": section.color } as CSSProperties}
                      aria-label={`Page ${i + 1}, ${section.name}`}
                      aria-current={i === index ? "page" : undefined}
                      onPointerEnter={(event) => onEnter(event, i)}
                      onClick={() => onSelect(i)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        {hover && hovered && (
          <div
            className="grid-view__hover"
            style={{ top: hover.top, left: hover.left }}
            aria-hidden
          >
            <div className="grid-view__label">
              Page {hover.index + 1} · {sectionName(hover.index)}
            </div>
            {thumbnails[hovered.id] && (
              <img
                className="grid-view__thumbnail"
                src={thumbnails[hovered.id]}
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
      </div>
    </div>
  );
}
