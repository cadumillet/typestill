import { useEffect, useRef, useState, type FormEvent } from "react";
import { PAGE_SIZES_MM, type Orientation, type PageSize } from "../page/paper";
import type { Notebook } from "../store/model";
import { COVER_COLORS, coverFromFields } from "./cover";
import { CoverSwatch } from "./CoverSwatch";
import "./settings.css";

export type NotebookSettings = Pick<Notebook, "cover" | "pageSize" | "orientation">;

export interface SettingsDialogProps {
  open: boolean;
  notebook: Notebook;
  onSave: (settings: NotebookSettings) => void | Promise<void>;
  onClose: () => void;
}

const PAGE_SIZES = Object.keys(PAGE_SIZES_MM) as PageSize[];
const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];

/** Notebook settings: the cover, and the page size and orientation that apply to every page. */
export function SettingsDialog({ open, notebook, onSave, onClose }: SettingsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pageSize, setPageSize] = useState(notebook.pageSize);
  const [orientation, setOrientation] = useState(notebook.orientation);
  const [color, setColor] = useState(notebook.cover.color);
  const [emoji, setEmoji] = useState(notebook.cover.emoji ?? "");
  const [subtitle, setSubtitle] = useState(notebook.cover.subtitle ?? "");
  const cover = coverFromFields({ color, emoji, subtitle });

  // Native dialog: showModal traps focus and closes on Escape.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setPageSize(notebook.pageSize);
      setOrientation(notebook.orientation);
      setColor(notebook.cover.color);
      setEmoji(notebook.cover.emoji ?? "");
      setSubtitle(notebook.cover.subtitle ?? "");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, notebook.pageSize, notebook.orientation, notebook.cover]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave({ cover, pageSize, orientation });
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
            Applies to every page. Text keeps its place on the lines; on a smaller page, text past
            the last line stays saved but out of view.
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
