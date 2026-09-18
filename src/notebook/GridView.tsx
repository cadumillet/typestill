import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Cross, Plus } from "../shell/icons";
import { pageSide } from "../page/sides";
import { SHEET, type Page, type Section } from "../store/model";
import { fillShade } from "./fill";
import { sectionIndexOf, sectionRange } from "./sections";
import "./gridview.css";

export interface GridViewProps {
  /** The notebook's pages in position order. */
  pages: readonly Page[];
  /** Index of the open page. */
  index: number;
  sections: readonly Section[];
  size: number;
  /** Rendered previews by page id, shown beside the hovered square when there is one. */
  thumbnails: Record<string, string>;
  /** A square: opens the page (the caller closes the view). */
  onSelect: (index: number) => void;
  /** A section's name: opens the section where it was left (the caller closes the view). */
  onOpenSection: (sectionId: string) => void;
  /** The plus in a gap: cuts a new section starting at that position (a multiple of SHEET). */
  onCut: (start: number) => void;
  /** A cut dragged to a new sheet boundary. */
  onMoveCut: (sectionId: string, start: number) => void;
  /** A cut's cross: the caller asks, then merges the section into the one before. */
  onRemoveCut: (sectionId: string) => void;
  onClose: () => void;
}

interface Hover {
  index: number;
  /** Where the hover box goes, in px from the grid's top-left corner. */
  top: number;
  left: number;
}

/** A square's side, the gap between squares, and the gap between sheets, in px. */
const SQUARE = 12;
const GAP = 4;
const SHEET_GAP = 10;
/** The pitch from one sheet's left edge to the next's. */
const PITCH = SQUARE + SHEET_GAP;
/** Rough heights of the hover box, with and without a thumbnail, for keeping it in view. */
const HOVER_HEIGHT = 230;
const LABEL_HEIGHT = 26;
const THUMBNAIL_CORNER = "4px";

/**
 * The grid view: the whole notebook at a glance, over the desk. One column per sheet,
 * four squares tall, read down each column then across; a square's shade is the page's
 * fill in its section's colour, the open page's is ringed. Sections are the cuts between
 * columns: a line in the gap before a section's first sheet with its name above the
 * column; the gap between two sheets offers a plus that cuts a new section there; a cut
 * is dragged by whole sheets; its cross merges the section into the one before. Hovering
 * a square shows "Page 7 · Work" and the page's thumbnail; a click opens the page.
 * Escape closes the view.
 */
export function GridView({
  pages,
  index,
  sections,
  size,
  thumbnails,
  onSelect,
  onOpenSection,
  onCut,
  onMoveCut,
  onRemoveCut,
  onClose,
}: GridViewProps) {
  const grid = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  /** A cut being dragged: which section, and the sheet boundary under the pointer. */
  const [drag, setDrag] = useState<{ sectionId: string; start: number } | null>(null);
  const sheets = size / SHEET;
  const dragged = drag ? sections.find((s) => s.id === drag.sectionId) : undefined;

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

  /** The sheet boundary (a position) under a pointer, from its x within the columns. */
  const boundaryAt = (clientX: number): number => {
    const columns = grid.current?.querySelector(".grid-view__sheets");
    if (!columns) return 0;
    const left = columns.getBoundingClientRect().left;
    const sheet = Math.round((clientX - left) / PITCH);
    return Math.min(Math.max(sheet, 1), sheets - 1) * SHEET;
  };

  // A cut is dragged by whole sheets: the line follows the pointer between the
  // neighbouring cuts and lands on release.
  const onCutDown = (event: PointerEvent<HTMLDivElement>, section: Section) => {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser does not track (synthetic events); the drag still works
      // while the pointer stays over the cut.
    }
    setDrag({ sectionId: section.id, start: section.start });
  };
  const onCutMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const start = boundaryAt(event.clientX);
    if (start !== drag.start) setDrag({ ...drag, start });
  };
  const onCutUp = (section: Section) => {
    if (!drag) return;
    setDrag(null);
    const i = sections.findIndex((s) => s.id === section.id);
    const before = sections[i - 1]?.start ?? -1;
    const after = sections[i + 1]?.start ?? size;
    if (drag.start !== section.start && drag.start > before && drag.start < after) {
      onMoveCut(section.id, drag.start);
    }
  };

  const hovered = hover ? pages[hover.index] : null;
  const sectionName = (position: number) => sections[sectionIndexOf(sections, position)].name;

  return (
    <div className="grid-view" role="dialog" aria-label="Notebook grid">
      <div className="grid-view__grid" ref={grid}>
        <div className="grid-view__names">
          {sections.map((section, i) => {
            const range = sectionRange(sections, size, i);
            return (
              <button
                key={section.id}
                type="button"
                className="grid-view__name"
                style={{
                  left: (range.start / SHEET) * PITCH,
                  maxWidth: ((range.end - range.start) / SHEET) * PITCH - 4,
                  color: section.color,
                }}
                title={`Open ${section.name} where it was left`}
                onClick={() => onOpenSection(section.id)}
              >
                {section.name}
              </button>
            );
          })}
        </div>
        <div
          className="grid-view__sheets"
          style={{ width: gridWidth(size), height: SHEET * SQUARE + (SHEET - 1) * GAP }}
          onPointerLeave={() => setHover(null)}
        >
          {Array.from({ length: sheets }, (_, sheet) => {
            const start = sheet * SHEET;
            const section = sections[sectionIndexOf(sections, start)];
            // The gap before this sheet holds the cut of a section starting here (the
            // first section starts at 0, before any gap), the ghost of a cut being dragged
            // here, or the plus that cuts a new section here.
            const own = sheet > 0 ? sections.find((s) => s.start === start) : undefined;
            const ghost = dragged && drag && drag.start === start && dragged.start !== start;
            return (
              <div key={sheet} className="grid-view__sheet" style={{ left: sheet * PITCH }}>
                {own && (
                  <div
                    className={`grid-view__cut${drag?.sectionId === own.id ? " is-dragging" : ""}`}
                    style={{ background: own.color }}
                    title="Drag by sheets to move the cut"
                    onPointerDown={(event) => onCutDown(event, own)}
                    onPointerMove={onCutMove}
                    onPointerUp={() => onCutUp(own)}
                    onPointerCancel={() => setDrag(null)}
                  >
                    {!drag && (
                      <button
                        type="button"
                        className="grid-view__cut-remove"
                        aria-label={`Remove the cut before ${own.name}`}
                        title={`Merge ${own.name} into the section before it`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => onRemoveCut(own.id)}
                      >
                        <Cross />
                      </button>
                    )}
                  </div>
                )}
                {!own && ghost && (
                  <div className="grid-view__cut is-ghost" style={{ background: dragged.color }} />
                )}
                {!own && !drag && sheet > 0 && (
                  <button
                    type="button"
                    className="grid-view__plus"
                    aria-label={`Cut a new section at page ${start + 1}`}
                    title={`Cut a new section at page ${start + 1}`}
                    onClick={() => onCut(start)}
                  >
                    <Plus />
                  </button>
                )}
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

/** The grid's width for a notebook, so the columns' box can be sized. */
function gridWidth(size: number): number {
  return (size / SHEET) * PITCH - SHEET_GAP;
}
