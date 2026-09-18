import { IconButton } from "../shell/IconButton";
import { Popover } from "../shell/Popover";
import { PageSettings as PageIcon } from "../shell/icons";
import { MAX_MARGIN_MM, MIN_MARGIN_MM } from "../page/paper";
import { MAX_ZINE_PADDING_MM } from "../page/zine";
import type { Page, PageKind, Section } from "../store/model";
import { NEW_SECTION_VALUE } from "./sections";
import "./pagesettings.css";

export interface PageSettingsProps {
  page: Page;
  number: number;
  count: number;
  /** Whether the page is empty, so its kind can still change. */
  canChangeKind: boolean;
  /** Whether the Kind row is shown at all: no while zine pages are behind their flag. */
  showKind: boolean;
  onKindChange: (kind: PageKind) => void;
  /** The notebook's sections; the page is in one of them. */
  sections: readonly Section[];
  onSectionChange: (sectionId: string) => void;
  /** "New section…" was picked: the caller asks for a name and moves the page there. */
  onNewSection: () => void;
  /** The page number toggle. */
  onMarksChange: (patch: Partial<Pick<Page, "showPageNumber">>) => void;
  /** Lined pages: the margin line offset in mm. */
  onMarginChange: (margin: number) => void;
  /** Lined pages. */
  twoColumns: boolean;
  onTwoColumnsChange: (enabled: boolean) => void;
  /** Zine pages: the padding, the only layout setting here (blocks have their own tools). */
  onPaddingChange: (padding: number) => void;
}

/** "September 18, 2026 at 3:42 PM": when the page was created, in the browser's locale. */
const formatCreated = (timestamp: number) =>
  new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const KINDS: { value: PageKind; label: string }[] = [
  { value: "lined", label: "Lined" },
  { value: "zine", label: "Zine" },
];

/** The page's metadata and its own settings, in a popover from the app bar. */
export function PageSettings({
  page,
  number,
  count,
  canChangeKind,
  showKind,
  onKindChange,
  sections,
  onSectionChange,
  onNewSection,
  onMarksChange,
  onMarginChange,
  twoColumns,
  onTwoColumnsChange,
  onPaddingChange,
}: PageSettingsProps) {
  const zine = page.zine;
  return (
    <Popover
      trigger={({ open, toggle, controls }) => (
        <IconButton
          label="Page settings"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={controls}
        >
          <PageIcon />
        </IconButton>
      )}
    >
      <div className="page-settings">
        <div className="page-settings__meta">
          <div>
            Page {number} of {count}
          </div>
          <div>Created {formatCreated(page.createdAt)}</div>
        </div>
        <label className="page-settings__row page-settings__row--field">
          <span>Section</span>
          <select
            value={page.sectionId}
            onChange={(event) => {
              const value = event.target.value;
              if (value === NEW_SECTION_VALUE) onNewSection();
              else onSectionChange(value);
            }}
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
            <option value={NEW_SECTION_VALUE}>New section…</option>
          </select>
        </label>
        {showKind && (
          <div className="page-settings__row page-settings__row--static">
            <span>Kind</span>
            <span className="page-settings__segments" role="radiogroup" aria-label="Page kind">
              {KINDS.map((kind) => (
                <button
                  key={kind.value}
                  type="button"
                  role="radio"
                  aria-checked={page.kind === kind.value}
                  disabled={!canChangeKind && page.kind !== kind.value}
                  title={canChangeKind ? undefined : "Only an empty page can change kind"}
                  onClick={() => page.kind !== kind.value && onKindChange(kind.value)}
                >
                  {kind.label}
                </button>
              ))}
            </span>
          </div>
        )}
        <label className="page-settings__row">
          <input
            type="checkbox"
            checked={page.showPageNumber}
            onChange={(event) => onMarksChange({ showPageNumber: event.target.checked })}
          />
          Page number
        </label>
        {page.kind === "lined" && (
          <>
            <label className="page-settings__row page-settings__row--field">
              <span>Margin line</span>
              <span className="page-settings__unit">
                <input
                  type="number"
                  min={MIN_MARGIN_MM}
                  max={MAX_MARGIN_MM}
                  step={1}
                  value={page.margin}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) onMarginChange(value);
                  }}
                />
                mm
              </span>
            </label>
            <label className="page-settings__row">
              <input
                type="checkbox"
                checked={twoColumns}
                onChange={(event) => onTwoColumnsChange(event.target.checked)}
              />
              Two columns
            </label>
          </>
        )}
        {page.kind === "zine" && zine && (
          <label className="page-settings__row page-settings__row--field">
            <span>Padding</span>
            <span className="page-settings__unit">
              <input
                type="number"
                min={0}
                max={MAX_ZINE_PADDING_MM}
                step={1}
                value={zine.padding}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) {
                    onPaddingChange(Math.min(MAX_ZINE_PADDING_MM, Math.max(0, value)));
                  }
                }}
              />
              mm
            </span>
          </label>
        )}
      </div>
    </Popover>
  );
}
