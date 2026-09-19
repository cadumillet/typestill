import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { mmToCssPx, pageGeometry, pageMm, ruleCount } from "../page/paper";
import { pageSide, type PageSide } from "../page/sides";
import { isPageBlank, type Notebook, type Page, type Section } from "../store/model";
import { getTheme } from "../theme/themes";
import { CoverSwatch } from "./CoverSwatch";
import { sectionOf } from "./sections";
import "./overview.css";

export interface OverviewProps {
  notebook: Notebook;
  /** The notebook's pages in position order. */
  pages: readonly Page[];
  /** Index of the open page: the overview opens scrolled to its spread. */
  index: number;
  /** Rendered previews by page id; a page without one shows paper. */
  thumbnails: Record<string, string>;
  /** A page: opens it (the caller closes the overview). */
  onSelect: (index: number) => void;
  /** A section's name: opens the section where it was left (the caller closes the overview). */
  onOpenSection: (sectionId: string) => void;
  onClose: () => void;
  /** The clean layout: the written count and the section names are hidden in place. */
  clean?: boolean;
}

/** A page's width in the overview, in px; the height follows the paper. */
export const OVERVIEW_PAGE_WIDTH = 120;

/**
 * The overview: the notebook flipped through at a glance, a scrollable column of its
 * spreads over the desk, cover to cover. The front cover alone on the right, then
 * (inside front cover | 1), (2 | 3) … (N | inside back cover), then the back cover alone
 * on the left. A page is its thumbnail, or plain paper while it is blank or not yet
 * rendered; the cover insides are the desk's plain surfaces. A section's name sits
 * beside the spread its first page opens, like a margin note, and opens the section
 * where it was left. A line at the top counts the pages written. Hovering a page shows
 * "Page 7 · Work"; a click opens it. Nothing marks the open page. Escape closes.
 */
export function Overview({
  notebook,
  pages,
  index,
  thumbnails,
  onSelect,
  onOpenSection,
  onClose,
  clean = false,
}: OverviewProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const theme = getTheme(notebook.themeId);
  const mm = pageMm(notebook.pageSize, notebook.orientation);
  const width = OVERVIEW_PAGE_WIDTH;
  const height = Math.round((width * mm.height) / mm.width);
  const zoom = width / pageGeometry(notebook.pageSize, notebook.orientation).width;
  const corner = mmToCssPx(theme.page.cornerMm, zoom);
  const written = pages.filter((page) => page.fill > 0).length;
  /**
   * A blank lined page's paper: the theme's rules and margin line in miniature, drawn by
   * CSS from the theme's metrics at the thumbnail's scale (px per mm), so a blank ruled
   * page is still a ruled page. Zine pages are plain.
   */
  const scale = width / mm.width;
  const { lined } = theme;
  const paperStyle = {
    background: theme.colours.paper,
    "--mini-rule": theme.colours.rule,
    "--mini-margin": theme.colours.margin,
    "--mini-pitch": `${lined.pitchMm * scale}px`,
    "--mini-rule-top": `${lined.firstRuleMm * scale}px`,
    "--mini-rules-height": `${ruleCount(mm.height, lined) * lined.pitchMm * scale}px`,
    "--mini-margin-left": `${notebook.defaults.margin * scale}px`,
  } as CSSProperties;
  const paperClass = [
    "overview__paper",
    lined.rules === "lines" ? "has-rules" : "",
    lined.marginLine ? "has-margin-line" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const count = pages.length;
  /** The rows of spreads between the covers: row r shows positions (2r − 3 | 2r − 2). */
  const spreadRows = count / 2 + 1;
  const rowOf = (position: number) => (position % 2 === 0 ? position / 2 + 1 : (position + 3) / 2);
  /** Sections by the row their first page opens. */
  const notes = new Map<number, Section>(
    notebook.sections.map((section) => [rowOf(section.start), section]),
  );

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

  // Opens on the open page's spread, centred in view.
  useLayoutEffect(() => {
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>(`[data-row="${rowOf(index)}"]`);
    if (!box || !row) return;
    box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2;
    // Only on opening: later re-renders (a thumbnail arriving) must not scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = {
    "--overview-page-width": `${width}px`,
    "--overview-page-height": `${height}px`,
    "--overview-corner": `${corner}px`,
  } as CSSProperties;

  const pageAt = (position: number): ReactNode => {
    const page = pages[position];
    const side = pageSide(position);
    const section = sectionOf(notebook.sections, position);
    const thumbnail = thumbnails[page.id];
    const label = `Page ${position + 1} · ${section.name}`;
    return (
      <button
        type="button"
        className={`overview__page is-${side}`}
        aria-label={label}
        onClick={() => onSelect(position)}
      >
        {thumbnail && !isPageBlank(page) ? (
          <img className="overview__thumbnail" src={thumbnail} alt="" draggable={false} />
        ) : (
          <span
            className={page.kind === "zine" ? "overview__paper" : paperClass}
            style={page.kind === "zine" ? { background: theme.colours.paper } : paperStyle}
          />
        )}
        <span className="overview__label" aria-hidden>
          {label}
        </span>
      </button>
    );
  };

  const slab = (side: PageSide) => <span className={`overview__slab is-${side}`} aria-hidden />;

  const cover = (side: PageSide) =>
    side === "right" ? (
      <span className="overview__cover is-right" aria-hidden>
        <CoverSwatch
          cover={notebook.cover}
          name={notebook.name}
          size={height}
          width={width}
          markSize={Math.round(width * 0.4)}
        >
          <span className="overview__cover-text">
            <span className="overview__cover-name">{notebook.name}</span>
            {notebook.cover.subtitle && (
              <span className="overview__cover-subtitle">{notebook.cover.subtitle}</span>
            )}
          </span>
        </CoverSwatch>
      </span>
    ) : (
      <span
        className="overview__cover is-left"
        style={{ background: notebook.cover.color }}
        aria-hidden
      />
    );

  const rows: ReactNode[] = [];
  // Row 0: the front cover alone on the right.
  rows.push(
    <div key="front" className="overview__row" data-row={0}>
      <span className="overview__note" />
      <div className="overview__spread">
        <span className="overview__slot" />
        <span className="overview__slot">{cover("right")}</span>
      </div>
      <span className="overview__note" />
    </div>,
  );
  for (let r = 1; r <= spreadRows; r++) {
    const left = 2 * r - 3;
    const right = 2 * r - 2;
    const note = notes.get(r);
    rows.push(
      <div key={r} className="overview__row" data-row={r}>
        <span className="overview__note">
          {note && (
            <button
              type="button"
              className="overview__section"
              style={{ color: note.color }}
              title={`Open ${note.name} where it was left`}
              onClick={() => onOpenSection(note.id)}
            >
              {note.name}
            </button>
          )}
        </span>
        <div className="overview__spread">
          <span className="overview__slot">{left >= 0 ? pageAt(left) : slab("left")}</span>
          <span className="overview__slot">{right < count ? pageAt(right) : slab("right")}</span>
        </div>
        <span className="overview__note" />
      </div>,
    );
  }
  // The last row: the back cover alone on the left.
  rows.push(
    <div key="back" className="overview__row" data-row={spreadRows + 1}>
      <span className="overview__note" />
      <div className="overview__spread">
        <span className="overview__slot">{cover("left")}</span>
        <span className="overview__slot" />
      </div>
      <span className="overview__note" />
    </div>,
  );

  return (
    <div
      className={`overview${clean ? " is-clean" : ""}`}
      role="dialog"
      aria-label="Overview"
      ref={scroller}
      style={style}
    >
      <div className="overview__head">
        {written} of {count} {count === 1 ? "page" : "pages"} written
      </div>
      <div className="overview__rows">{rows}</div>
    </div>
  );
}
