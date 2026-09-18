import { columnFromText } from "../page/document";
import { IconButton } from "../shell/IconButton";
import { Popover } from "../shell/Popover";
import { PageSettings as PageIcon } from "../shell/icons";
import {
  MAX_ZINE_PADDING_MM,
  MAX_ZINE_TEXT_ROWS,
  type Zine,
  type ZineLayout,
  type ZineTextSide,
} from "../page/zine";
import type { Page, PageKind } from "../store/model";
import "./pagesettings.css";

export interface PageSettingsProps {
  page: Page;
  number: number;
  count: number;
  /** Whether the page is empty, so its kind can still change. */
  canChangeKind: boolean;
  onKindChange: (kind: PageKind) => void;
  /** Lined pages. */
  twoColumns: boolean;
  onTwoColumnsChange: (enabled: boolean) => void;
  /**
   * Zine pages: a change to the media block or the text settings. A new layout comes
   * with the old images array; the caller resizes it and asks before dropping images.
   */
  onZineChange: (patch: Partial<Zine>) => void;
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const LAYOUTS: { value: ZineLayout; label: string }[] = [
  { value: "single", label: "One image" },
  { value: "row", label: "Two side by side" },
  { value: "column", label: "Two stacked" },
  { value: "square", label: "Two by two" },
];

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
  onKindChange,
  twoColumns,
  onTwoColumnsChange,
  onZineChange,
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
          <div>{formatDate(page.createdAt)}</div>
        </div>
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
        {page.kind === "lined" && (
          <label className="page-settings__row">
            <input
              type="checkbox"
              checked={twoColumns}
              onChange={(event) => onTwoColumnsChange(event.target.checked)}
            />
            Two columns
          </label>
        )}
        {page.kind === "zine" && zine && (
          <>
            <label className="page-settings__row page-settings__row--field">
              <span>Images</span>
              <select
                value={zine.media.layout}
                onChange={(event) =>
                  onZineChange({
                    media: { ...zine.media, layout: event.target.value as ZineLayout },
                  })
                }
              >
                {LAYOUTS.map((layout) => (
                  <option key={layout.value} value={layout.value}>
                    {layout.label}
                  </option>
                ))}
              </select>
            </label>
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
                      onZineChange({ padding: Math.min(MAX_ZINE_PADDING_MM, Math.max(0, value)) });
                    }
                  }}
                />
                mm
              </span>
            </label>
            <label className="page-settings__row">
              <input
                type="checkbox"
                checked={zine.textBelow !== null}
                onChange={(event) =>
                  onZineChange({ textBelow: event.target.checked ? columnFromText("") : null })
                }
              />
              Text below
            </label>
            {zine.textBelow && (
              <label className="page-settings__row page-settings__row--field page-settings__row--sub">
                <span>Rows</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_ZINE_TEXT_ROWS}
                  step={1}
                  value={zine.textRows}
                  onChange={(event) => {
                    const value = Math.round(Number(event.target.value));
                    if (Number.isFinite(value)) {
                      onZineChange({ textRows: Math.min(MAX_ZINE_TEXT_ROWS, Math.max(1, value)) });
                    }
                  }}
                />
              </label>
            )}
            <label className="page-settings__row">
              <input
                type="checkbox"
                checked={zine.textBeside !== null}
                onChange={(event) =>
                  onZineChange({ textBeside: event.target.checked ? columnFromText("") : null })
                }
              />
              Text beside
            </label>
            {zine.textBeside && (
              <label className="page-settings__row page-settings__row--field page-settings__row--sub">
                <span>Side</span>
                <select
                  value={zine.textSide}
                  onChange={(event) =>
                    onZineChange({ textSide: event.target.value as ZineTextSide })
                  }
                >
                  <option value="right">right</option>
                  <option value="left">left</option>
                </select>
              </label>
            )}
          </>
        )}
      </div>
    </Popover>
  );
}
