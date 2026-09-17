import { useEffect, useRef, useState, type FormEvent } from "react";
import { PAGE_SIZES_MM, type Orientation, type PageSize } from "../page/paper";
import type { Notebook } from "../store/model";
import "./settings.css";

export type NotebookSettings = Pick<Notebook, "pageSize" | "orientation">;

export interface SettingsDialogProps {
  open: boolean;
  notebook: Notebook;
  onSave: (settings: NotebookSettings) => void | Promise<void>;
  onClose: () => void;
}

const PAGE_SIZES = Object.keys(PAGE_SIZES_MM) as PageSize[];
const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];

/** Notebook settings: page size and orientation, which apply to every page. */
export function SettingsDialog({ open, notebook, onSave, onClose }: SettingsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pageSize, setPageSize] = useState(notebook.pageSize);
  const [orientation, setOrientation] = useState(notebook.orientation);

  // Native dialog: showModal traps focus and closes on Escape.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setPageSize(notebook.pageSize);
      setOrientation(notebook.orientation);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, notebook.pageSize, notebook.orientation]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave({ pageSize, orientation });
    onClose();
  };

  return (
    <dialog ref={ref} className="settings" onClose={onClose} aria-label="Notebook settings">
      <form onSubmit={submit}>
        <h2 className="settings__title">{notebook.name}</h2>
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
          Applies to every page. Text keeps its place on the lines; on a smaller page, text past the
          last line stays saved but out of view.
        </p>
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
