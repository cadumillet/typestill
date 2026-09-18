import type { ReactNode } from "react";
import { IconButton } from "../shell/IconButton";
import { Menu } from "../shell/Menu";
import { ChevronLeft, ChevronRight, Images, NewPage, Pencil, Trash } from "../shell/icons";
import type { PageKind } from "../store/model";
import { ADD_PAGE_HINT } from "./pageRules";
import "./pagebar.css";

/** The bar's height in px; the desk fits the page above it. */
export const PAGE_BAR_HEIGHT = 40;

export interface PageBarProps {
  /** Index of the open page. */
  index: number;
  count: number;
  onSelect: (index: number) => void;
  previousShortcut?: string;
  nextShortcut?: string;
  /** Whether a page may be added now (the one-page rule); off otherwise, with a hint. */
  canAdd: boolean;
  addShortcut?: string;
  /** Whether zine pages can be made: a lined-or-zine menu, else a plain lined-page button. */
  zinePages: boolean;
  onAdd: (kind: PageKind) => void;
  /** Delete the open page: the caller asks first. */
  onDelete: () => void;
  /** The page settings popover, between new page and delete. */
  children?: ReactNode;
  /** Drawing mode: the pencil is pressed while it is on. */
  drawing: boolean;
  drawingShortcut?: string;
  onToggleDrawing: () => void;
  /** The drawing tools popover, shown next to the pencil in drawing mode. */
  drawingTools?: ReactNode;
  /** The media pool toggle, on zine pages only: null hides it. */
  poolOpen: boolean | null;
  onTogglePool: () => void;
}

/**
 * The bar under the page or spread, centred on it like a caption: previous, the page
 * counter, next; then new page (lined or zine, or lined only while zine pages are behind
 * their flag), page settings and delete page; then the pencil that switches drawing
 * mode, with the drawing tools while it is on, and on zine pages the media pool toggle.
 * Its popovers and tooltips open upwards, over the page, since the bar sits at the
 * bottom of the desk.
 */
export function PageBar({
  index,
  count,
  onSelect,
  previousShortcut,
  nextShortcut,
  canAdd,
  addShortcut,
  zinePages,
  onAdd,
  onDelete,
  children,
  drawing,
  drawingShortcut,
  onToggleDrawing,
  drawingTools,
  poolOpen,
  onTogglePool,
}: PageBarProps) {
  return (
    <nav className="page-bar" aria-label="Page controls" style={{ height: PAGE_BAR_HEIGHT }}>
      <IconButton
        label="Previous page"
        shortcut={previousShortcut}
        onClick={() => onSelect(index - 1)}
        disabled={index === 0}
      >
        <ChevronLeft />
      </IconButton>
      <span className="page-bar__counter">
        {index + 1} / {count}
      </span>
      <IconButton
        label="Next page"
        shortcut={nextShortcut}
        onClick={() => onSelect(index + 1)}
        disabled={index === count - 1}
      >
        <ChevronRight />
      </IconButton>
      <span className="page-bar__gap" />
      {zinePages ? (
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
      ) : (
        <IconButton
          label={canAdd ? "New page" : `New page (${ADD_PAGE_HINT})`}
          shortcut={canAdd ? addShortcut : undefined}
          off={!canAdd}
          onClick={() => onAdd("lined")}
        >
          <NewPage />
        </IconButton>
      )}
      {children}
      <IconButton label="Delete page" onClick={onDelete}>
        <Trash />
      </IconButton>
      <span className="page-bar__gap" />
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
    </nav>
  );
}
