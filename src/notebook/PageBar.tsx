import type { CSSProperties, ReactNode } from "react";
import { IconButton } from "../shell/IconButton";
import { ChevronLeft, ChevronRight, Columns, Grid, Images, Pencil } from "../shell/icons";
import type { Section } from "../store/model";
import "./pagebar.css";

/** The bar's height in px; the desk fits the page above it. */
export const PAGE_BAR_HEIGHT = 40;

export interface PageBarProps {
  /** Index of the open page. */
  index: number;
  count: number;
  /** The open page's section, shown as a dot in the counter. */
  section: Section | undefined;
  onSelect: (index: number) => void;
  previousShortcut?: string;
  nextShortcut?: string;
  /** The grid view: the counter and the grid button at the left end toggle it. */
  gridOpen: boolean;
  gridShortcut?: string;
  onToggleGrid: () => void;
  /** The layout toggle, on lined pages: whether the page has two columns; null hides it. */
  twoColumns: boolean | null;
  onTwoColumnsChange: (enabled: boolean) => void;
  /** Drawing mode: the pencil is pressed while it is on. */
  drawing: boolean;
  drawingShortcut?: string;
  onToggleDrawing: () => void;
  /** The drawing tools popover, shown next to the pencil in drawing mode. */
  drawingTools?: ReactNode;
  /** The media pool toggle, on zine pages only: null hides it. */
  poolOpen: boolean | null;
  onTogglePool: () => void;
  /** Anything else that sits at the right end, before the layout toggle. */
  children?: ReactNode;
}

/**
 * The bar under the page or spread, as wide as it. In its middle, centred on the page:
 * previous, the counter (the section's dot and "n / N", a button that toggles the grid
 * view), next. At its left end: the grid view button. At its right end: the layout
 * toggle (two columns, on lined pages), the pencil that switches drawing mode with the
 * drawing tools while it is on, and on zine pages the media pool toggle. There is no new
 * page and no delete page: the notebook has its pages. Its popovers and tooltips open
 * upwards, over the page, since the bar sits at the bottom of the desk.
 */
export function PageBar({
  index,
  count,
  section,
  onSelect,
  previousShortcut,
  nextShortcut,
  gridOpen,
  gridShortcut,
  onToggleGrid,
  twoColumns,
  onTwoColumnsChange,
  drawing,
  drawingShortcut,
  onToggleDrawing,
  drawingTools,
  poolOpen,
  onTogglePool,
  children,
}: PageBarProps) {
  return (
    <nav className="page-bar" aria-label="Page controls" style={{ height: PAGE_BAR_HEIGHT }}>
      <div className="page-bar__group page-bar__group--start">
        <IconButton
          label={gridOpen ? "Close the grid" : "Grid view"}
          shortcut={gridShortcut}
          pressed={gridOpen}
          onClick={onToggleGrid}
        >
          <Grid />
        </IconButton>
      </div>
      <div className="page-bar__group page-bar__group--centre">
        <IconButton
          label="Previous page"
          shortcut={previousShortcut}
          onClick={() => onSelect(index - 1)}
          disabled={index === 0}
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          label={section ? `Grid view (${section.name})` : "Grid view"}
          shortcut={gridShortcut}
          className="page-bar__counter"
          pressed={gridOpen}
          onClick={onToggleGrid}
        >
          {section && (
            <span
              className="page-bar__dot"
              style={{ "--section": section.color } as CSSProperties}
            />
          )}
          <span className="page-bar__count">
            {index + 1} / {count}
          </span>
        </IconButton>
        <IconButton
          label="Next page"
          shortcut={nextShortcut}
          onClick={() => onSelect(index + 1)}
          disabled={index === count - 1}
        >
          <ChevronRight />
        </IconButton>
      </div>
      <div className="page-bar__group page-bar__group--end">
        {children}
        {twoColumns !== null && (
          <IconButton
            label={twoColumns ? "One column" : "Two columns"}
            pressed={twoColumns}
            onClick={() => onTwoColumnsChange(!twoColumns)}
          >
            <Columns />
          </IconButton>
        )}
        <IconButton
          label={drawing ? "Stop drawing" : "Draw"}
          shortcut={drawingShortcut}
          pressed={drawing}
          onClick={onToggleDrawing}
        >
          <Pencil />
        </IconButton>
        {drawing && drawingTools}
        {poolOpen !== null && (
          <IconButton
            label={poolOpen ? "Hide media pool" : "Show media pool"}
            pressed={poolOpen}
            onClick={onTogglePool}
          >
            <Images />
          </IconButton>
        )}
      </div>
    </nav>
  );
}
