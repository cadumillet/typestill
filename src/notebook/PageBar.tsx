import type { ReactNode } from "react";
import { IconButton } from "../shell/IconButton";
import { Menu } from "../shell/Menu";
import { ChevronLeft, ChevronRight, NewPage, Trash } from "../shell/icons";
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
  onAdd: (kind: PageKind) => void;
  /** Delete the open page: the caller asks first. */
  onDelete: () => void;
  /** The page settings popover, between new page and delete. */
  children?: ReactNode;
}

/**
 * The bar under the page or spread, centred on it like a caption: previous, the page
 * counter, next; then new page (lined or zine), page settings and delete page. Its
 * popovers and tooltips open upwards, over the page, since the bar sits at the bottom
 * of the desk.
 */
export function PageBar({
  index,
  count,
  onSelect,
  previousShortcut,
  nextShortcut,
  canAdd,
  addShortcut,
  onAdd,
  onDelete,
  children,
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
      {children}
      <IconButton label="Delete page" onClick={onDelete}>
        <Trash />
      </IconButton>
    </nav>
  );
}
