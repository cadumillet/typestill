import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_MARGIN_MM,
  MIN_MARGIN_MM,
  PAGE_SIZES_MM,
  clampMargin,
  type Orientation,
  type PageSize,
} from "../page/paper";
import type { Notebook, Section } from "../store/model";
import { APPEARANCES, resolveAppearance, type Appearance } from "../shell/appearance";
import { THEMES, getTheme, isDarkTheme } from "../theme/themes";
import { formatBytes } from "../store/zip";
import { COVER_COLORS, coverFromFields } from "./cover";
import { CoverSwatch } from "./CoverSwatch";
import { SECTION_COLORS, nextSectionColor } from "./sections";
import "./settings.css";

export type NotebookSettings = Pick<
  Notebook,
  "name" | "cover" | "themeId" | "pageSize" | "orientation" | "defaults"
>;

export interface SettingsDialogProps {
  open: boolean;
  notebook: Notebook;
  /** The app appearance, which is not a notebook setting but is chosen here too. */
  appearance: Appearance;
  onSave: (settings: NotebookSettings, appearance: Appearance) => void | Promise<void>;
  onClose: () => void;
  /** What the notebook takes in this browser, and how many images nothing uses. */
  storage: { total: number; images: number; imageCount: number; unusedCount: number };
  /** Removes the unused images at once (after a confirm the caller owns). */
  onPruneImages: () => void;
  /** Section edits apply at once, not on Save. */
  onAddSection: (input: { name: string; color: string }) => void;
  onUpdateSection: (sectionId: string, patch: Partial<Pick<Section, "name" | "color">>) => void;
  /** Swaps the section with its neighbour above (-1) or below (1). */
  onMoveSection: (sectionId: string, direction: -1 | 1) => void;
  /** Deletes a section, moving its pages to a neighbour: the caller asks first. */
  onDeleteSection: (sectionId: string) => void;
}

const APPEARANCE_LABELS: Record<Appearance, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const PAGE_SIZES = Object.keys(PAGE_SIZES_MM) as PageSize[];
const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];

/** Notebook settings: the name and cover, the theme, and the page size and orientation of every page. */
export function SettingsDialog({
  open,
  notebook,
  appearance: currentAppearance,
  onSave,
  onClose,
  storage,
  onPruneImages,
  onAddSection,
  onUpdateSection,
  onMoveSection,
  onDeleteSection,
}: SettingsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [themeId, setThemeId] = useState(notebook.themeId);
  const [appearance, setAppearance] = useState(currentAppearance);
  const [pageSize, setPageSize] = useState(notebook.pageSize);
  const [orientation, setOrientation] = useState(notebook.orientation);
  const [margin, setMargin] = useState(notebook.defaults.margin);
  const [name, setName] = useState(notebook.name);
  const [color, setColor] = useState(notebook.cover.color);
  const [emoji, setEmoji] = useState(notebook.cover.emoji ?? "");
  const [subtitle, setSubtitle] = useState(notebook.cover.subtitle ?? "");
  const cover = coverFromFields({ color, emoji, subtitle });
  /** A blank name keeps the current one, as the shelf's rename did. */
  const shownName = name.trim() || notebook.name;

  // Native dialog: showModal traps focus and closes on Escape.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setThemeId(notebook.themeId);
      setAppearance(currentAppearance);
      setPageSize(notebook.pageSize);
      setOrientation(notebook.orientation);
      setMargin(notebook.defaults.margin);
      setName(notebook.name);
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
    notebook.name,
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
        name: shownName,
        cover,
        themeId,
        pageSize,
        orientation,
        defaults: { ...notebook.defaults, margin: clampMargin(margin) },
      },
      appearance,
    );
    onClose();
  };

  return (
    <dialog ref={ref} className="settings" onClose={onClose} aria-label="Notebook settings">
      <form onSubmit={submit}>
        <h2 className="settings__title">Notebook settings</h2>
        <fieldset className="settings__group">
          <legend>Cover</legend>
          <div className="settings__cover">
            <CoverSwatch cover={cover} name={shownName} size={56} />
            <div className="settings__cover-fields">
              <label className="settings__field settings__name">
                <span>Name</span>
                <input
                  type="text"
                  value={name}
                  placeholder={notebook.name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
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
                  placeholder={shownName.trim().charAt(0).toUpperCase() || "–"}
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
          <p className="settings__note">What a new page starts with.</p>
        </fieldset>
        <fieldset className="settings__group">
          <legend>Sections</legend>
          <ul className="settings__sections">
            {notebook.sections.map((section, i) => (
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
                <button
                  type="button"
                  className="settings__section-move"
                  aria-label={`Move ${section.name} up`}
                  disabled={i === 0}
                  onClick={() => onMoveSection(section.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="settings__section-move"
                  aria-label={`Move ${section.name} down`}
                  disabled={i === notebook.sections.length - 1}
                  onClick={() => onMoveSection(section.id, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="settings__section-delete"
                  aria-label={`Delete section ${section.name}`}
                  disabled={notebook.sections.length === 1}
                  title={
                    notebook.sections.length === 1
                      ? "The last section cannot be deleted"
                      : "Its pages move to the section next to it"
                  }
                  onClick={() => onDeleteSection(section.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="settings__add-section"
            onClick={() =>
              onAddSection({ name: "New section", color: nextSectionColor(notebook.sections) })
            }
          >
            Add section
          </button>
          <p className="settings__note">
            The notebook's divisions, in order. Every page is in one; the order sets the page order
            and the numbering.
          </p>
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
          <p className="settings__note">The chrome, in this browser. Pages follow their theme.</p>
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
