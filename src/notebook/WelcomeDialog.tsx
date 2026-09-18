import { useEffect, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { COVER_COLORS, DEFAULT_COVER, type Cover } from "./cover";
import { CoverSwatch } from "./CoverSwatch";
import "./settings.css";
import "./welcome.css";

export const DEFAULT_NOTEBOOK_NAME = "Notebook";

export interface WelcomeDialogProps {
  /** Creates the first notebook and opens it. */
  onOpen: (name: string, cover: Cover) => Promise<void>;
  /** Restores a backup file and opens that notebook. Rejects for files that are not backups. */
  onRestore: (file: File) => Promise<void>;
}

/**
 * The first-run welcome: shown in place of the notebook while storage holds none. A name,
 * a cover colour and one button, or a backup file to start from. It cannot be dismissed
 * into an empty app: Escape is refused, and a close the browser forces anyway opens the
 * notebook with what the form holds.
 */
export function WelcomeDialog({ onOpen, onRestore }: WelcomeDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(DEFAULT_NOTEBOOK_NAME);
  const [color, setColor] = useState(DEFAULT_COVER.color);
  const [busy, setBusy] = useState(false);
  /** Set once a choice is on its way, so a close event after it does nothing. */
  const chosen = useRef(false);
  const cover: Cover = { ...DEFAULT_COVER, color };
  const shownName = name.trim() || DEFAULT_NOTEBOOK_NAME;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const open = () => {
    if (chosen.current) return;
    chosen.current = true;
    setBusy(true);
    void onOpen(shownName, cover);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    open();
  };

  const restore = async (file: File | undefined) => {
    if (!file || chosen.current) return;
    chosen.current = true;
    setBusy(true);
    try {
      await onRestore(file);
    } catch (error) {
      chosen.current = false;
      setBusy(false);
      window.alert(error instanceof Error ? error.message : "Could not open the backup.");
    }
  };

  const refuseCancel = (event: SyntheticEvent) => event.preventDefault();

  return (
    <dialog
      ref={ref}
      className="settings welcome"
      aria-label="Welcome"
      onCancel={refuseCancel}
      onClose={open}
    >
      <form onSubmit={submit}>
        <p className="welcome__wordmark">typestill</p>
        <p className="welcome__intro">
          Lined pages you write on and draw on, one after another, in sections. Everything stays in
          this browser and in the backup files you download; there is no account.
        </p>
        <fieldset className="settings__group" disabled={busy}>
          <legend>Your first notebook</legend>
          <div className="settings__cover">
            <CoverSwatch cover={cover} name={shownName} size={56} />
            <div className="settings__cover-fields">
              <label className="settings__field welcome__name">
                <span>Name</span>
                <input
                  type="text"
                  value={name}
                  placeholder={DEFAULT_NOTEBOOK_NAME}
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
            </div>
          </div>
        </fieldset>
        <div className="settings__actions welcome__actions">
          <button
            type="button"
            className="welcome__backup"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            Open a backup…
          </button>
          <button type="submit" className="primary" disabled={busy}>
            Open the notebook
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.zip,application/json,application/zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void restore(file);
          }}
        />
      </form>
    </dialog>
  );
}
