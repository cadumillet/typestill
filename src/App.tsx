import { useState } from "react";
import { TextPage } from "./page/TextPage";
import { DEFAULT_MARGIN_MM, defaultDivider, fitPage, pageGeometry, pageMm } from "./page/paper";
import { useElementSize } from "./page/useElementSize";
import { columnsForDivider } from "./store/model";

// Phase 1, first cut: the text page editor on its own, in memory. The split view with
// the canvas, storage and navigation come next.
const PAGE_SIZE = "A5";
const ORIENTATION = "portrait";
const DESK_PADDING = 32;
const MARGIN = DEFAULT_MARGIN_MM;

export function App() {
  const [columns, setColumns] = useState<string[]>([""]);
  const [divider, setDivider] = useState<number | null>(null);
  const [clear, setClear] = useState(false);
  const [deskRef, desk] = useElementSize<HTMLElement>();

  const geometry = pageGeometry(PAGE_SIZE, ORIENTATION);
  const fit = desk
    ? fitPage(geometry, {
        width: desk.width - 2 * DESK_PADDING,
        height: desk.height - 2 * DESK_PADDING,
      })
    : null;

  const toggleDivider = () => {
    const next =
      divider === null ? defaultDivider(pageMm(PAGE_SIZE, ORIENTATION).width, MARGIN) : null;
    setColumns((current) => columnsForDivider(current, next));
    setDivider(next);
  };

  return (
    <div className="app">
      <header className="app-header">
        <span className="wordmark">typestill</span>
        <span className="meta">
          {PAGE_SIZE} · {ORIENTATION}
        </span>
        <div className="app-header__actions">
          <button type="button" onClick={toggleDivider} aria-pressed={divider !== null}>
            Two columns
          </button>
          <button type="button" onClick={() => setClear((c) => !c)} aria-pressed={clear}>
            Clear
          </button>
        </div>
      </header>
      <main className="desk" ref={deskRef}>
        {fit && (
          <TextPage
            size={PAGE_SIZE}
            orientation={ORIENTATION}
            zoom={fit.zoom}
            margin={MARGIN}
            columns={columns}
            divider={divider}
            clear={clear}
            onChange={setColumns}
          />
        )}
      </main>
    </div>
  );
}
