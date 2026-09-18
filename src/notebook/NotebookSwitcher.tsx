import type { NotebookSummary } from "../store/notebooks";
import { Popover } from "../shell/Popover";
import { ChevronDown } from "../shell/icons";
import { CoverSwatch } from "./CoverSwatch";
import "./notebookswitcher.css";

export interface NotebookSwitcherProps {
  notebooks: NotebookSummary[];
  currentId: string;
  /** Page count of the open notebook, which the summaries may not have caught up with. */
  currentPageCount: number;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
}

/** Closes the popover the way Menu does: through the outside pointerdown it listens for. */
const closePopovers = () => document.dispatchEvent(new PointerEvent("pointerdown"));

/**
 * The notebook's cover swatch and name in the app bar, opening a list of every notebook
 * to switch to and a way to create one. Bare on purpose: renaming and deleting belong to the shelf screen.
 */
export function NotebookSwitcher({
  notebooks,
  currentId,
  currentPageCount,
  onOpen,
  onCreate,
}: NotebookSwitcherProps) {
  const current = notebooks.find((n) => n.id === currentId);

  const create = () => {
    closePopovers();
    const name = window.prompt("Name for the new notebook", "Notebook")?.trim();
    if (name) onCreate(name);
  };

  return (
    <Popover
      className="switcher"
      align="left"
      trigger={({ open, toggle, controls }) => (
        <button
          type="button"
          className="switcher__trigger"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={controls}
        >
          {current && <CoverSwatch cover={current.cover} name={current.name} size={16} />}
          <span className="switcher__name">{current?.name ?? "Notebook"}</span>
          <ChevronDown />
        </button>
      )}
    >
      <ul className="switcher__list" role="menu" aria-label="Notebooks">
        {notebooks.map((notebook) => {
          const isCurrent = notebook.id === currentId;
          const count = isCurrent ? currentPageCount : notebook.pageCount;
          return (
            <li key={notebook.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                className="switcher__item"
                onClick={() => {
                  closePopovers();
                  if (!isCurrent) onOpen(notebook.id);
                }}
              >
                <CoverSwatch cover={notebook.cover} name={notebook.name} size={18} />
                <span className="switcher__item-name">
                  {notebook.name}
                  {notebook.cover.subtitle && (
                    <span className="switcher__item-subtitle">{notebook.cover.subtitle}</span>
                  )}
                </span>
                <span className="switcher__item-count">
                  {count} {count === 1 ? "page" : "pages"}
                </span>
              </button>
            </li>
          );
        })}
        <li role="separator" className="switcher__separator" />
        <li role="none">
          <button type="button" role="menuitem" className="switcher__item" onClick={create}>
            New notebook…
          </button>
        </li>
      </ul>
    </Popover>
  );
}
