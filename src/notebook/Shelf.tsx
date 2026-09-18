import { useRef } from "react";
import { Menu } from "../shell/Menu";
import { Dots } from "../shell/icons";
import type { NotebookSummary } from "../store/notebooks";
import { COVER_COLORS } from "./cover";
import { CoverSwatch } from "./CoverSwatch";
import "./shelf.css";

export interface ShelfProps {
  notebooks: NotebookSummary[];
  onOpen: (id: string) => void;
  onCreate: (name: string, color: string) => void;
  onRename: (id: string, name: string) => void;
  /** Asks first; the caller only deletes. */
  onDelete: (id: string) => void;
  onRestore: (file: File) => void;
}

/** The palette colour the fewest notebooks wear, so new covers tell apart. */
export function leastUsedColor(notebooks: readonly { cover: { color: string } }[]): string {
  let best = COVER_COLORS[0].value;
  let fewest = Infinity;
  for (const { value } of COVER_COLORS) {
    const count = notebooks.filter((n) => n.cover.color === value).length;
    if (count < fewest) {
      fewest = count;
      best = value;
    }
  }
  return best;
}

/** "Opened today", "Opened 3 days ago", "Opened September 2, 2026". */
export function describeOpened(lastOpenedAt: number, now = Date.now()): string {
  const days = Math.floor((now - lastOpenedAt) / 86_400_000);
  if (days <= 0) return "Opened today";
  if (days === 1) return "Opened yesterday";
  if (days < 30) return `Opened ${days} days ago`;
  return `Opened ${new Date(lastOpenedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`;
}

/**
 * The shelf: every notebook as its cover, most recently opened first. Notebooks are
 * created, renamed and deleted here and nowhere else; clicking a cover opens it.
 */
export function Shelf({ notebooks, onOpen, onCreate, onRename, onDelete, onRestore }: ShelfProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const create = () => {
    const name = window.prompt("Name for the new notebook", "Notebook")?.trim();
    if (!name) return;
    onCreate(name, leastUsedColor(notebooks));
  };

  const rename = (notebook: NotebookSummary) => {
    const name = window.prompt("Name for the notebook", notebook.name)?.trim();
    if (name && name !== notebook.name) onRename(notebook.id, name);
  };

  return (
    <div className="shelf">
      <header className="shelf__bar">
        <span className="wordmark">typestill</span>
        <div className="shelf__actions">
          <button type="button" onClick={() => fileInput.current?.click()}>
            Open a backup…
          </button>
          <button type="button" className="primary" onClick={create}>
            New notebook
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onRestore(file);
            }}
          />
        </div>
      </header>
      <ul className="shelf__grid">
        {notebooks.map((notebook) => (
          <li key={notebook.id} className="shelf__card">
            <button
              type="button"
              className="shelf__cover"
              onClick={() => onOpen(notebook.id)}
              aria-label={`Open ${notebook.name}`}
            >
              <CoverSwatch cover={notebook.cover} name={notebook.name} size={150} />
            </button>
            <div className="shelf__meta">
              <div className="shelf__title">
                <span className="shelf__name">{notebook.name}</span>
                <Menu
                  label={`Notebook ${notebook.name}`}
                  items={[
                    { label: "Rename…", onSelect: () => rename(notebook) },
                    { label: "Delete…", onSelect: () => onDelete(notebook.id) },
                  ]}
                >
                  <Dots />
                </Menu>
              </div>
              {notebook.cover.subtitle && (
                <div className="shelf__subtitle">{notebook.cover.subtitle}</div>
              )}
              <div className="shelf__detail">
                {notebook.pageCount} {notebook.pageCount === 1 ? "page" : "pages"} ·{" "}
                {describeOpened(notebook.lastOpenedAt)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
