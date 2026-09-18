import { useEffect, useRef, useState } from "react";
import {
  MAX_MARGIN_MM,
  MIN_MARGIN_MM,
  PAGE_SIZES_MM,
  clampMargin,
  defaultDivider,
  pageMm,
  type Orientation,
  type PageSize,
} from "../page/paper";
import { MAX_ZINE_PADDING_MM } from "../page/zine";
import { SHEET, type Notebook, type Page, type PageKind, type Section } from "../store/model";
import { APPEARANCES, resolveAppearance, type Appearance } from "../shell/appearance";
import { THEMES, getTheme, isDarkTheme } from "../theme/themes";
import { formatBytes } from "../store/zip";
import { COVER_COLORS, coverFromFields } from "./cover";
import { CoverSwatch } from "./CoverSwatch";
import { SECTION_COLORS, nextSectionColor, sectionOf, sectionRange } from "./sections";
import "./settings.css";

export type NotebookSettings = Pick<
  Notebook,
  "name" | "cover" | "themeId" | "pageSize" | "orientation" | "defaults"
>;

export interface NotebookBoxProps {
  open: boolean;
  onClose: () => void;
  notebook: Notebook;
  /** The pages in position order, and the open one. */
  pages: readonly Page[];
  index: number;
  /** Section edits apply at once; the cuts go through the store's rules (the caller reports a refusal). */
  onCut: (start: number, input: { name: string; color: string }) => void;
  onUpdateSection: (sectionId: string, patch: Partial<Pick<Section, "name" | "color">>) => void;
  /** Moves a section's cut to a sheet boundary between its neighbours. */
  onMoveCut: (sectionId: string, start: number) => void;
  /** Removes a cut, merging the section into the one before: the caller asks first. */
  onRemoveCut: (sectionId: string) => void;
  /** This page: the open page and what can be set on it. */
  page: Page;
  /** Empties the page's writing and drawing: the caller asks first. */
  onClearPage: () => void;
  /** Lined pages: two columns or one; null on zine pages. */
  twoColumns: boolean | null;
  onTwoColumnsChange: (enabled: boolean) => void;
  /** The Kind row, behind the zine flag; the kind can change while the page is empty. */
  showKind: boolean;
  canChangeKind: boolean;
  onKindChange: (kind: PageKind) => void;
  /** Zine pages: the padding, the only layout setting (blocks have their own tools). */
  onPaddingChange: (padding: number) => void;
  /** Notebook settings apply as they are made. */
  onUpdateSettings: (patch: Partial<NotebookSettings>) => void;
  /** The page count: grows by whole sheets, or shrinks (the store refuses over writing; the caller reports). */
  onResize: (size: number) => void;
  /** The app appearance, which is not a notebook setting but is chosen here too. */
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  /** What the notebook takes in this browser, and how many images nothing uses. */
  storage: { total: number; images: number; imageCount: number; unusedCount: number };
  /** Removes the unused images at once (after a confirm the caller owns). */
  onPruneImages: () => void;
}

const APPEARANCE_LABELS: Record<Appearance, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const PAGE_SIZES = Object.keys(PAGE_SIZES_MM) as PageSize[];
const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];
const KINDS: { value: PageKind; label: string }[] = [
  { value: "lined", label: "Lined" },
  { value: "zine", label: "Zine" },
];

/** "September 18, 2026 at 3:42 PM": when the page was created, in the browser's locale. */
const formatCreated = (timestamp: number) =>
  new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * The notebook box: everything about the notebook in one dialog, opened from the app
 * bar's cover-and-name button, the page bar's counter and ⌥M. Top to bottom: the map,
 * the sections, this page (its section, layout, kind behind the flag, when it was
 * created), then the notebook's own groups (name and cover, paper, theme, new-page
 * defaults, the app appearance, storage). Every change applies as it is made; there is
 * no Save, only Close and Escape.
 */
export function NotebookBox({
  open,
  onClose,
  notebook,
  pages,
  index,
  onCut,
  onUpdateSection,
  onMoveCut,
  onRemoveCut,
  page,
  onClearPage,
  twoColumns,
  onTwoColumnsChange,
  showKind,
  canChangeKind,
  onKindChange,
  onPaddingChange,
  onUpdateSettings,
  onResize,
  appearance,
  onAppearanceChange,
  storage,
  onPruneImages,
}: NotebookBoxProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Text fields keep what is typed; a blank name keeps the notebook's, so it is applied
  // only once it is a name again.
  const [name, setName] = useState(notebook.name);
  const [emoji, setEmoji] = useState(notebook.cover.emoji ?? "");
  const [subtitle, setSubtitle] = useState(notebook.cover.subtitle ?? "");
  const [margin, setMargin] = useState(String(notebook.defaults.margin));
  const shownName = name.trim() || notebook.name;
  const zine = page.zine;
  const width = pageMm(notebook.pageSize, notebook.orientation).width;
  /** A new section takes the last section's last sheet, which must not be its only one. */
  const lastRange = sectionRange(notebook.sections, notebook.size, notebook.sections.length - 1);
  const canAddSection = lastRange.end - lastRange.start >= 2 * SHEET;

  // Native dialog: showModal traps focus and closes on Escape. The fields are reset from
  // the notebook each time the box opens, at the top, on the map.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName(notebook.name);
      setEmoji(notebook.cover.emoji ?? "");
      setSubtitle(notebook.cover.subtitle ?? "");
      setMargin(String(notebook.defaults.margin));
      dialog.showModal();
      dialog.scrollTop = 0;
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, notebook.name, notebook.cover, notebook.defaults.margin]);

  const setCover = (fields: { color?: string; emoji?: string; subtitle?: string }) => {
    onUpdateSettings({
      cover: coverFromFields({
        color: fields.color ?? notebook.cover.color,
        emoji: fields.emoji ?? emoji,
        subtitle: fields.subtitle ?? subtitle,
      }),
    });
  };

  // Picking a dark theme suggests the dark appearance; the two stay separate settings.
  const pickTheme = (themeId: string) => {
    onUpdateSettings({ themeId });
    if (isDarkTheme(getTheme(themeId)) && resolveAppearance(appearance) === "light") {
      onAppearanceChange("dark");
    }
  };

  const setDefaults = (patch: Partial<Notebook["defaults"]>) =>
    onUpdateSettings({ defaults: { ...notebook.defaults, ...patch } });

  return (
    <dialog
      ref={ref}
      className="settings"
      onClose={onClose}
      // The browser closes a modal on Escape by itself; handling the key too keeps it
      // closing when the browser's close watcher does not run (automation, some embeds).
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      aria-label="Notebook"
    >
      <div className="settings__head">
        <h2 className="settings__title">{notebook.name}</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <fieldset className="settings__group">
        <legend>Sections</legend>
        <ul className="settings__sections">
          {notebook.sections.map((section, i) => {
            const range = sectionRange(notebook.sections, notebook.size, i);
            const before = notebook.sections[i - 1]?.start ?? -SHEET;
            const after = notebook.sections[i + 1]?.start ?? notebook.size;
            return (
              <li key={section.id} className="settings__section">
                <input
                  type="text"
                  value={section.name}
                  aria-label="Section name"
                  onChange={(event) => onUpdateSection(section.id, { name: event.target.value })}
                />
                <span className="settings__swatches" role="radiogroup" aria-label="Section colour">
                  {SECTION_COLORS.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      role="radio"
                      aria-checked={choice.value === section.color}
                      aria-label={choice.name}
                      className="settings__swatch settings__swatch--small"
                      style={{ background: choice.value }}
                      onClick={() => onUpdateSection(section.id, { color: choice.value })}
                    />
                  ))}
                </span>
                <label className="settings__unit settings__start">
                  <span>from</span>
                  <input
                    type="number"
                    aria-label={`${section.name} starts at page`}
                    title={
                      i === 0
                        ? "The first section starts at page 1"
                        : `Starts at page: a sheet boundary between ${before + SHEET + 1} and ${after - SHEET + 1}`
                    }
                    min={before + SHEET + 1}
                    max={after - SHEET + 1}
                    step={SHEET}
                    value={section.start + 1}
                    disabled={i === 0}
                    className="settings__number"
                    onChange={(event) => {
                      const start = Number(event.target.value) - 1;
                      if (
                        Number.isInteger(start) &&
                        start % SHEET === 0 &&
                        start > before &&
                        start < after
                      ) {
                        onMoveCut(section.id, start);
                      }
                    }}
                  />
                  <span className="settings__pages">
                    {range.end - range.start} {range.end - range.start === 1 ? "page" : "pages"}
                  </span>
                </label>
                <button
                  type="button"
                  className="settings__section-delete"
                  aria-label={`Delete section ${section.name}`}
                  disabled={i === 0}
                  title={
                    i === 0
                      ? "The first section cannot be deleted"
                      : "Its pages merge into the section before it"
                  }
                  onClick={() => onRemoveCut(section.id)}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className={`settings__add-section${canAddSection ? "" : " is-off"}`}
          aria-disabled={!canAddSection || undefined}
          title={
            canAddSection
              ? undefined
              : "The last section has one sheet; cut a longer one in the grid"
          }
          onClick={() =>
            canAddSection &&
            onCut(notebook.size - SHEET, {
              name: "Section",
              color: nextSectionColor(notebook.sections),
            })
          }
        >
          Add section
        </button>
        <p className="settings__note">
          Sections are cuts on sheet boundaries (page 1, 5, 9, …), each at least a sheet of four
          pages; a new one takes the last section's last sheet. The grid view (⌥M) cuts them where
          you see them.
        </p>
      </fieldset>
      <fieldset className="settings__group">
        <legend>This page</legend>
        <p className="settings__note settings__note--first">
          Page {index + 1} of {pages.length}, in {sectionOf(notebook.sections, page.position).name},
          created {formatCreated(page.createdAt)}.
        </p>
        {twoColumns !== null && (
          <label className="settings__check">
            <input
              type="checkbox"
              checked={twoColumns}
              onChange={(event) => onTwoColumnsChange(event.target.checked)}
            />
            Two columns
          </label>
        )}
        {showKind && (
          <label className="settings__field">
            <span>Kind</span>
            <select
              value={page.kind}
              disabled={!canChangeKind}
              title={canChangeKind ? undefined : "Only an empty page can change kind"}
              onChange={(event) => onKindChange(event.target.value as PageKind)}
            >
              {KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {showKind && page.kind === "zine" && zine && (
          <label className="settings__field">
            <span>Padding</span>
            <span className="settings__unit">
              <input
                type="number"
                min={0}
                max={MAX_ZINE_PADDING_MM}
                step={1}
                value={zine.padding}
                className="settings__number"
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
        <button type="button" className="settings__section-delete" onClick={onClearPage}>
          Clear page…
        </button>
        <p className="settings__note">
          Clearing empties the page's writing and drawing; the page keeps its place. A notebook has
          its pages: none is added or deleted.
        </p>
      </fieldset>
      <fieldset className="settings__group">
        <legend>Cover</legend>
        <div className="settings__cover">
          <CoverSwatch cover={notebook.cover} name={shownName} size={56} />
          <div className="settings__cover-fields">
            <label className="settings__field settings__name">
              <span>Name</span>
              <input
                type="text"
                value={name}
                placeholder={notebook.name}
                onChange={(event) => {
                  setName(event.target.value);
                  const trimmed = event.target.value.trim();
                  if (trimmed) onUpdateSettings({ name: trimmed });
                }}
              />
            </label>
            <div className="settings__swatches" role="radiogroup" aria-label="Cover colour">
              {COVER_COLORS.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={choice.value === notebook.cover.color}
                  aria-label={choice.name}
                  className="settings__swatch"
                  style={{ background: choice.value }}
                  onClick={() => setCover({ color: choice.value })}
                />
              ))}
            </div>
            <label className="settings__field">
              <span>Emoji</span>
              <input
                type="text"
                value={emoji}
                placeholder={shownName.trim().charAt(0).toUpperCase() || "–"}
                onChange={(event) => {
                  setEmoji(event.target.value);
                  setCover({ emoji: event.target.value });
                }}
                className="settings__emoji"
                aria-describedby="cover-emoji-hint"
              />
            </label>
            <label className="settings__field">
              <span>Subtitle</span>
              <input
                type="text"
                value={subtitle}
                placeholder="Optional"
                onChange={(event) => {
                  setSubtitle(event.target.value);
                  setCover({ subtitle: event.target.value });
                }}
                className="settings__subtitle"
              />
            </label>
          </div>
        </div>
        <p className="settings__note" id="cover-emoji-hint">
          Without an emoji, the cover shows the name's initial.
        </p>
      </fieldset>
      <fieldset className="settings__group">
        <legend>Paper</legend>
        <label className="settings__field">
          <span>Page size</span>
          <select
            value={notebook.pageSize}
            onChange={(event) => onUpdateSettings({ pageSize: event.target.value as PageSize })}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} · {PAGE_SIZES_MM[size].width} × {PAGE_SIZES_MM[size].height} mm
              </option>
            ))}
          </select>
        </label>
        <label className="settings__field">
          <span>Orientation</span>
          <select
            value={notebook.orientation}
            onChange={(event) =>
              onUpdateSettings({ orientation: event.target.value as Orientation })
            }
          >
            {ORIENTATIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="settings__field">
          <span>Pages</span>
          <span className="settings__unit">
            <input
              type="number"
              min={SHEET}
              step={SHEET}
              value={notebook.size}
              className="settings__number"
              title="Whole sheets of four: grows with blank pages; shrinks only over blank pages"
              onChange={(event) => {
                const size = Number(event.target.value);
                if (
                  Number.isInteger(size) &&
                  size > 0 &&
                  size % SHEET === 0 &&
                  size !== notebook.size
                ) {
                  onResize(size);
                }
              }}
            />
            pages
          </span>
        </label>
        <label className="settings__field">
          <span>Theme</span>
          <select value={notebook.themeId} onChange={(event) => pickTheme(event.target.value)}>
            {THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>
        <label className="settings__field">
          <span>Margin line</span>
          <span className="settings__unit">
            <input
              type="number"
              min={MIN_MARGIN_MM}
              max={MAX_MARGIN_MM}
              step={1}
              value={margin}
              className="settings__number"
              onChange={(event) => {
                setMargin(event.target.value);
                const value = Number(event.target.value);
                if (event.target.value !== "" && Number.isFinite(value)) {
                  setDefaults({ margin: clampMargin(value) });
                }
              }}
            />
            mm
          </span>
        </label>
        <p className="settings__note">
          Apply to every page. Text keeps its lines; on a smaller page or a theme with a wider font,
          text past the last line stays saved but out of view.
        </p>
      </fieldset>
      <fieldset className="settings__group">
        <legend>New pages</legend>
        <label className="settings__check">
          <input
            type="checkbox"
            checked={notebook.defaults.divider !== null}
            onChange={(event) =>
              setDefaults({
                divider: event.target.checked
                  ? defaultDivider(width, notebook.defaults.margin)
                  : null,
              })
            }
          />
          Two columns
        </label>
        <p className="settings__note">
          What a new page starts with when it is not made from the page in front of you.
        </p>
      </fieldset>
      <fieldset className="settings__group">
        <legend>App</legend>
        <label className="settings__field">
          <span>Appearance</span>
          <select
            value={appearance}
            onChange={(event) => onAppearanceChange(event.target.value as Appearance)}
          >
            {APPEARANCES.map((value) => (
              <option key={value} value={value}>
                {APPEARANCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <p className="settings__note">The chrome, in this browser. Pages follow their theme.</p>
      </fieldset>
      <fieldset className="settings__group">
        <legend>Storage</legend>
        <p className="settings__note settings__note--first">
          {formatBytes(storage.total)} in this browser
          {storage.imageCount > 0 &&
            `, of which ${formatBytes(storage.images)} in ${storage.imageCount} ${storage.imageCount === 1 ? "image" : "images"}`}
          . Backups carry all of it; with images they come as a zip.
        </p>
        <button
          type="button"
          className="settings__prune"
          disabled={storage.unusedCount === 0}
          onClick={onPruneImages}
        >
          {storage.unusedCount === 0
            ? "No unused images"
            : `Remove ${storage.unusedCount} unused ${storage.unusedCount === 1 ? "image" : "images"}…`}
        </button>
      </fieldset>
    </dialog>
  );
}
