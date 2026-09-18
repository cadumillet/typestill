import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { pageSide, type Side } from "../page/sides";
import type { Page, Section } from "../store/model";
import "./edge.css";

export interface EdgeProps {
  /** The pages in notebook order (section order, then creation order). */
  pages: readonly Page[];
  /** Index of the page shown. */
  index: number;
  sections: readonly Section[];
  /** The notebook's sides, for rounding a thumbnail's outer corners. */
  sides: readonly Side[];
  /** Rendered previews by page id, shown beside the hovered line when there is one. */
  thumbnails: Record<string, string>;
  /** Where the sheet sits in the desk, so the strip's top and bottom align with the page. */
  top: number;
  height: number;
  onSelect: (index: number) => void;
}

interface Hover {
  index: number;
  /** Centre of the hovered line, in px from the strip's top. */
  top: number;
}

/** Below this spacing the lines are 1px and pack; above it they are 2px. */
const PACKED_BELOW_PX = 3;
/** Rough heights of the hover box, with and without a thumbnail, for keeping it in view. */
const HOVER_HEIGHT = 230;
const LABEL_HEIGHT = 26;
/** The thumbnail's outer corners, rounded like the page's; the inner edge stays square. */
const THUMBNAIL_CORNER = "4px";

/**
 * The edge, an experiment behind the `edge` flag: the notebook seen from its fore-edge,
 * a strip as tall as the page to its left with one thin line per page in notebook order,
 * top to bottom, evenly spaced over the strip's height. Each line is a tint of its
 * section's colour; the open page's is the full colour and the full width of the strip,
 * the others half as wide. A section change leaves one empty slot, so the sections read
 * as bands. Hovering a line shows "Page 7 · Work" and the page's thumbnail beside the
 * strip; clicking opens the page. Nothing else: no tabs, no drag.
 */
export function Edge({
  pages,
  index,
  sections,
  sides,
  thumbnails,
  top,
  height,
  onSelect,
}: EdgeProps) {
  const strip = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const colours = new Map(sections.map((section) => [section.id, section.color]));

  // One slot per page plus one per change of section; the slots share the height.
  const slots = pages.reduce(
    (count, page, i) => count + (i > 0 && pages[i - 1].sectionId !== page.sectionId ? 2 : 1),
    0,
  );
  const spacing = slots > 0 ? height / slots : height;
  const thickness = spacing < PACKED_BELOW_PX ? 1 : 2;
  /** Which slot each page's line sits in. */
  const slotOf: number[] = [];
  pages.forEach((page, i) => {
    const gap = i > 0 && pages[i - 1].sectionId !== page.sectionId ? 1 : 0;
    slotOf.push(i === 0 ? 0 : slotOf[i - 1] + 1 + gap);
  });

  // The hover box sits to the right of the strip, centred on the line but kept inside
  // the strip's height so a thumbnail near the top or bottom is not cut off.
  const onEnter = (event: PointerEvent<HTMLButtonElement>, i: number) => {
    if (!strip.current) return;
    const target = event.currentTarget.getBoundingClientRect();
    const box = strip.current.getBoundingClientRect();
    const half = (thumbnails[pages[i].id] ? HOVER_HEIGHT : LABEL_HEIGHT) / 2;
    const centre = target.top - box.top + target.height / 2;
    setHover({
      index: i,
      top: Math.min(Math.max(centre, half), Math.max(half, box.height - half)),
    });
  };

  const hovered = hover ? pages[hover.index] : null;
  const sectionName = (page: Page) => sections.find((s) => s.id === page.sectionId)?.name ?? "";

  return (
    <nav className="edge" aria-label="Notebook edge" style={{ paddingTop: top }}>
      <div
        className="edge__strip"
        style={{ height, "--edge-line": `${thickness}px` } as CSSProperties}
        ref={strip}
        onPointerLeave={() => setHover(null)}
      >
        {pages.map((page, i) => (
          <button
            key={page.id}
            type="button"
            className="edge__page"
            aria-label={`Page ${i + 1}, ${sectionName(page)}`}
            aria-current={i === index ? "page" : undefined}
            style={
              {
                top: slotOf[i] * spacing,
                height: spacing,
                "--section": colours.get(page.sectionId) ?? "currentColor",
              } as CSSProperties
            }
            onPointerEnter={(event) => onEnter(event, i)}
            onClick={() => onSelect(i)}
          />
        ))}
        {hover && hovered && (
          <div className="edge__hover" style={{ top: hover.top }} aria-hidden>
            <div className="edge__label">
              Page {hover.index + 1} · {sectionName(hovered)}
            </div>
            {thumbnails[hovered.id] && (
              <img
                className="edge__thumbnail"
                src={thumbnails[hovered.id]}
                alt=""
                draggable={false}
                style={{
                  borderRadius:
                    pageSide(sides, hover.index) === "right"
                      ? `0 ${THUMBNAIL_CORNER} ${THUMBNAIL_CORNER} 0`
                      : `${THUMBNAIL_CORNER} 0 0 ${THUMBNAIL_CORNER}`,
                }}
              />
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
