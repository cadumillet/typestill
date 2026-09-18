import type { CSSProperties } from "react";
import { maxSections, mmToCssPx, pageMm, type Orientation, type PageSize } from "../page/paper";
import type { Section } from "../store/model";
import "./sectiontabs.css";

/** How far a tab sticks out past the page edge, in mm; the open page's section further. */
export const TAB_OUT_MM = 6;
export const TAB_OUT_OPEN_MM = 9;
/** The slots run down the page's edge between these margins from the top and bottom. */
const SLOT_MARGIN_MM = 8;
/** A tab is this much shorter than its slot, so neighbours read apart. */
const TAB_GAP_MM = 2;

export interface SectionTabsProps {
  sections: readonly Section[];
  /** The index, in section order, of the open page's section. */
  openIndex: number;
  size: PageSize;
  orientation: Orientation;
  /** CSS px per scene px, the page's. */
  zoom: number;
  /** Opens the section where it was left, as the map's tabs do. */
  onOpenSection: (sectionId: string) => void;
}

/** Where a section's tab sits and how far it sticks out, in CSS px, for the given page. */
export function tabGeometry(
  index: number,
  size: PageSize,
  orientation: Orientation,
  zoom: number,
): { top: number; height: number } {
  const mm = pageMm(size, orientation);
  const slot = (mm.height - 2 * SLOT_MARGIN_MM) / maxSections(size, orientation);
  return {
    top: mmToCssPx(SLOT_MARGIN_MM + index * slot + TAB_GAP_MM / 2, zoom),
    height: mmToCssPx(slot - TAB_GAP_MM, zoom),
  };
}

/**
 * The tabs, an experiment behind the `tabs` flag: every section's index tab on the
 * edges of the page or spread, all visible at once as on a closed notebook. Section i
 * owns slot i of maxSections down the page's edge, in section order. A tab sits on the
 * left edge of the sheet while its divider is in the left stack (the sections up to and
 * including the open page's) and on the right edge while it is in the right stack; the
 * open page's section sticks out further. The tab is the section's colour with its name
 * written along it; hovering shows the name, clicking opens the section where it was
 * left. Rendered inside the desk's sheet, over the page, allowed to overflow it.
 */
export function SectionTabs({
  sections,
  openIndex,
  size,
  orientation,
  zoom,
  onOpenSection,
}: SectionTabsProps) {
  const limit = maxSections(size, orientation);
  return (
    <div className="section-tabs" aria-label="Sections">
      {sections.slice(0, limit).map((section, i) => {
        const left = i <= openIndex;
        const open = i === openIndex;
        const { top, height } = tabGeometry(i, size, orientation, zoom);
        return (
          <button
            key={section.id}
            type="button"
            className={`section-tab section-tab--${left ? "left" : "right"}${open ? " is-open" : ""}`}
            style={
              {
                top,
                height,
                width: mmToCssPx(open ? TAB_OUT_OPEN_MM : TAB_OUT_MM, zoom),
                background: section.color,
                fontSize: mmToCssPx(3, zoom),
                "--page-corner": `${mmToCssPx(2, zoom)}px`,
              } as CSSProperties
            }
            aria-label={`Section ${section.name}`}
            data-tooltip={section.name}
            onClick={() => onOpenSection(section.id)}
          >
            <span className="section-tab__name">{section.name}</span>
          </button>
        );
      })}
    </div>
  );
}
