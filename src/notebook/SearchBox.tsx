import { useEffect, useState, type KeyboardEvent } from "react";
import { IconButton } from "../shell/IconButton";
import { Popover } from "../shell/Popover";
import { Search as SearchIcon } from "../shell/icons";
import type { Page } from "../store/model";
import { searchNotebook, type SearchResult } from "./search";
import "./searchbox.css";

export interface SearchBoxProps {
  pages: readonly Page[];
  onOpenPage: (index: number) => void;
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const SHORTCUT = isMac ? "⌘K" : "Ctrl+K";

const resultKey = (result: SearchResult) => `page:${result.index}`;

/** "Page 3", or "Page 3 · drawing" when the match is in the text drawn on the page. */
const whereLabel = (result: SearchResult) =>
  result.where === "drawing" ? `Page ${result.number} · drawing` : `Page ${result.number}`;

/**
 * The search popover from the app bar: a text field that filters as you type, over the
 * pages whose text or drawing contains the query. A result opens the page. Cmd/Ctrl+K
 * opens it.
 */
export function SearchBox({ pages, onOpenPage }: SearchBoxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);

  const run = (text: string) => {
    setQuery(text);
    setResults(searchNotebook(text, pages));
    setActive(0);
  };

  const show = () => {
    // Pages may have changed since the last look.
    setResults(searchNotebook(query, pages));
    setActive(0);
    setOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // Excalidraw takes Cmd+K for its link editor when an element is selected.
      if (event.defaultPrevented) return;
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (!modifier || event.shiftKey || event.altKey || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      show();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const pick = (result: SearchResult) => {
    setOpen(false);
    onOpenPage(result.index);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(results[active]);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={({ toggle, controls }) => (
        <IconButton
          label="Search"
          shortcut={SHORTCUT}
          onClick={open ? toggle : show}
          aria-expanded={open}
          aria-controls={controls}
        >
          <SearchIcon />
        </IconButton>
      )}
    >
      <div className="search" role="search">
        <input
          className="search__input"
          type="text"
          placeholder="Search pages"
          aria-label="Search"
          value={query}
          onChange={(event) => run(event.target.value)}
          onKeyDown={onInputKeyDown}
          autoFocus
          spellCheck={false}
        />
        {results.length > 0 ? (
          <ul className="search__results" role="listbox" aria-label="Results">
            {results.map((result, i) => (
              <li key={resultKey(result)} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`search__result${i === active ? " is-active" : ""}`}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(result)}
                >
                  <span className="search__where">{whereLabel(result)}</span>
                  <span className="search__snippet">
                    {result.snippet.before}
                    <mark>{result.snippet.match}</mark>
                    {result.snippet.after}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : query.trim() ? (
          <p className="search__empty">No matches</p>
        ) : null}
      </div>
    </Popover>
  );
}
