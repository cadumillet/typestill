import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_MARGIN_MM,
  MIN_MARGIN_MM,
  PAGE_SIZES_MM,
  clampMargin,
  type Orientation,
  type PageSize,
} from "../page/paper";
import type { Notebook, Tag } from "../store/model";
import { APPEARANCES, resolveAppearance, type Appearance } from "../shell/appearance";
import { THEMES, getTheme, isDarkTheme } from "../theme/themes";
import { COVER_COLORS, coverFromFields } from "./cover";
import { CoverSwatch } from "./CoverSwatch";
import { TAG_COLORS, nextTagColor } from "./tags";
import "./settings.css";

export type NotebookSettings = Pick<
  Notebook,
  "cover" | "themeId" | "pageSize" | "orientation" | "defaults"
>;

export interface SettingsDialogProps {
  open: boolean;
  notebook: Notebook;
  /** The app appearance, which is not a notebook setting but is chosen here too. */
  appearance: Appearance;
  onSave: (settings: NotebookSettings, appearance: Appearance) => void | Promise<void>;
  onClose: () => void;
  /** Tag edits apply at once, not on Save. */
  onAddTag: (input: { name: string; color: string }) => void;
  onUpdateTag: (tagId: string, patch: Partial<Pick<Tag, "name" | "color">>) => void;
  onDeleteTag: (tagId: string) => void;
}

const APPEARANCE_LABELS: Record<Appearance, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const PAGE_SIZES = Object.keys(PAGE_SIZES_MM) as PageSize[];
const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];

/** Notebook settings: the cover, the theme, and the page size and orientation of every page. */
export function SettingsDialog({
  open,
  notebook,
  appearance: currentAppearance,
  onSave,
  onClose,
  onAddTag,
  onUpdateTag,
  onDeleteTag,
}: SettingsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [themeId, setThemeId] = useState(notebook.themeId);
  const [appearance, setAppearance] = useState(currentAppearance);
  const [pageSize, setPageSize] = useState(notebook.pageSize);
  const [orientation, setOrientation] = useState(notebook.orientation);
  const [showDate, setShowDate] = useState(notebook.defaults.showDate);
  const [showPageNumber, setShowPageNumber] = useState(notebook.defaults.showPageNumber);
  const [margin, setMargin] = useState(notebook.defaults.margin);
  const [color, setColor] = useState(notebook.cover.color);
  const [emoji, setEmoji] = useState(notebook.cover.emoji ?? "");
  const [subtitle, setSubtitle] = useState(notebook.cover.subtitle ?? "");
  const cover = coverFromFields({ color, emoji, subtitle });

  // Native dialog: showModal traps focus and closes on Escape.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setThemeId(notebook.themeId);
      setAppearance(currentAppearance);
      setPageSize(notebook.pageSize);
      setOrientation(notebook.orientation);
      setShowDate(notebook.defaults.showDate);
      setShowPageNumber(notebook.defaults.showPageNumber);
      setMargin(notebook.defaults.margin);
      setColor(notebook.cover.color);
      setEmoji(notebook.cover.emoji ?? "");
      setSubtitle(notebook.cover.subtitle ?? "");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [
    open,
    currentAppearance,
    notebook.themeId,
    notebook.pageSize,
    notebook.orientation,
    notebook.defaults,
    notebook.cover,
  ]);

  // Picking a dark theme suggests the dark appearance; the two stay separate settings.
  const pickTheme = (id: string) => {
    setThemeId(id);
    if (isDarkTheme(getTheme(id)) && resolveAppearance(appearance) === "light") {
      setAppearance("dark");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave(
      {
        cover,
        themeId,
        pageSize,
        orientation,
        defaults: { ...notebook.defaults, showDate, showPageNumber, margin: clampMargin(margin) },
      },
      appearance,
    );
    onClose();
  };

  return (
    <dialog ref={ref} className="settings" onClose={onClose} aria-label="Notebook settings">
      <form onSubmit={submit}>
        <h2 className="settings__title">{notebook.name}</h2>
        <fieldset className="settings__group">
          <legend>Cover</legend>
          <div className="settings__cover">
            <CoverSwatch cover={cover} name={notebook.name} size={56} />
            <div className="settings__cover-fields">
              <div className="settings__swatches" role="radiogroup" aria-label="Cover colour">
                {COVER_COLORS.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={choice.value === color}
                    aria-label={choice.name}
                    className="settings__swatch"
                    style={{ background: choice.value }}
                    onClick={() => setColor(choice.value)}
                  />
                ))}
              </div>
              <label className="settings__field">
                <span>Emoji</span>
                <input
                  type="text"
                  value={emoji}
                  placeholder={notebook.name.trim().charAt(0).toUpperCase() || "–"}
                  onChange={(event) => setEmoji(event.target.value)}
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
                  onChange={(event) => setSubtitle(event.target.value)}
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
          <legend>Pages</legend>
          <label className="settings__field">
            <span>Theme</span>
            <select value={themeId} onChange={(event) => pickTheme(event.target.value)}>
              {THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          <label className="settings__field">
            <span>Page size</span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(event.target.value as PageSize)}
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
              value={orientation}
              onChange={(event) => setOrientation(event.target.value as Orientation)}
            >
              {ORIENTATIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <p className="settings__note">
            Apply to every page. Text keeps its lines; on a smaller page or a theme with a wider
            font, text past the last line stays saved but out of view.
          </p>
        </fieldset>
        <fieldset className="settings__group">
          <legend>New pages</legend>
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
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) setMargin(value);
                }}
              />
              mm
            </span>
          </label>
          <label className="settings__check">
            <input
              type="checkbox"
              checked={showDate}
              onChange={(event) => setShowDate(event.target.checked)}
            />
            Date stamp
          </label>
          <label className="settings__check">
            <input
              type="checkbox"
              checked={showPageNumber}
              onChange={(event) => setShowPageNumber(event.target.checked)}
            />
            Page number
          </label>
          <p className="settings__note">
            What a new page starts with; each page has its own toggles in page settings.
          </p>
        </fieldset>
        <fieldset className="settings__group">
          <legend>Tags</legend>
          {notebook.tags.length === 0 && (
            <p className="settings__note settings__note--first">
              No tags yet. A page can carry one tag; its colour marks the page in the rail.
            </p>
          )}
          <ul className="settings__tags">
            {notebook.tags.map((tag) => (
              <li key={tag.id} className="settings__tag">
                <input
                  type="text"
                  value={tag.name}
                  aria-label="Tag name"
                  onChange={(event) => onUpdateTag(tag.id, { name: event.target.value })}
                />
                <span className="settings__swatches" role="radiogroup" aria-label="Tag colour">
                  {TAG_COLORS.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      role="radio"
                      aria-checked={choice.value === tag.color}
                      aria-label={choice.name}
                      className="settings__swatch settings__swatch--small"
                      style={{ background: choice.value }}
                      onClick={() => onUpdateTag(tag.id, { color: choice.value })}
                    />
                  ))}
                </span>
                <button
                  type="button"
                  className="settings__tag-delete"
                  aria-label={`Delete tag ${tag.name}`}
                  onClick={() => onDeleteTag(tag.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="settings__add-tag"
            onClick={() => onAddTag({ name: "New tag", color: nextTagColor(notebook.tags) })}
          >
            Add tag
          </button>
        </fieldset>
        <fieldset className="settings__group">
          <legend>App</legend>
          <label className="settings__field">
            <span>Appearance</span>
            <select
              value={appearance}
              onChange={(event) => setAppearance(event.target.value as Appearance)}
            >
              {APPEARANCES.map((value) => (
                <option key={value} value={value}>
                  {APPEARANCE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <p className="settings__note">
            The chrome and the canvas, in this browser. Pages follow their theme.
          </p>
        </fieldset>
        <div className="settings__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
