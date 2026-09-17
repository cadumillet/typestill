import { useCallback, useState } from "react";
import { Canvas, type CanvasContent } from "./canvas/Canvas";
import { useNotebookSession } from "./notebook/useNotebookSession";
import { TextPage } from "./page/TextPage";
import { defaultDivider, fitPage, pageGeometry, pageMm } from "./page/paper";
import { useElementSize } from "./page/useElementSize";
import { Panel } from "./shell/Panel";
import { SplitView } from "./shell/SplitView";

const DESK_PADDING = 24;
/** Panel margins plus the width below which Excalidraw falls into its mobile layout. */
const MIN_PANEL_WIDTH = 730 + 12;
const MIN_MAIN_WIDTH = 360;
const PANEL_STORAGE_KEY = "typestill.panel.width";

function readStoredWidth(): number | null {
  try {
    const value = Number(localStorage.getItem(PANEL_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function storeWidth(width: number): void {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Browser storage is a convenience only.
  }
}

export function App() {
  const session = useNotebookSession();
  const [clear, setClear] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelWidth, setPanelWidth] = useState(
    () => readStoredWidth() ?? Math.round(window.innerWidth * 0.55),
  );
  // The drawing survives the panel closing: the editor hands it back on unmount.
  const [canvasSnapshot, setCanvasSnapshot] = useState<CanvasContent>();
  const [deskRef, desk] = useElementSize<HTMLElement>();

  const handleWidth = useCallback((width: number) => {
    setPanelWidth(width);
    storeWidth(width);
  }, []);

  if (!session) {
    return <div className="loading">Opening notebook…</div>;
  }

  const { notebook, pages, index, page } = session;
  const geometry = pageGeometry(notebook.pageSize, notebook.orientation);
  const fit = desk
    ? fitPage(geometry, {
        width: desk.width - 2 * DESK_PADDING,
        height: desk.height - 2 * DESK_PADDING,
      })
    : null;

  const toggleDivider = () => {
    const width = pageMm(notebook.pageSize, notebook.orientation).width;
    void session.setDivider(page.divider === null ? defaultDivider(width, page.margin) : null);
  };

  return (
    <SplitView
      panelOpen={panelOpen}
      panelWidth={panelWidth}
      onPanelWidthChange={handleWidth}
      minMain={MIN_MAIN_WIDTH}
      minPanel={MIN_PANEL_WIDTH}
      main={
        <>
          <header className="app-header">
            <span className="wordmark">typestill</span>
            <span className="meta">
              {notebook.name} · {notebook.pageSize} · {notebook.orientation}
            </span>
            <nav className="page-nav" aria-label="Pages">
              <button
                type="button"
                className="icon-button"
                onClick={() => session.goTo(index - 1)}
                disabled={index === 0}
                title="Previous page"
              >
                ‹
              </button>
              <span className="page-nav__label">
                {index + 1} / {pages.length}
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={() => session.goTo(index + 1)}
                disabled={index === pages.length - 1}
                title="Next page"
              >
                ›
              </button>
              <button type="button" onClick={() => void session.newPage()} title="New page">
                + Page
              </button>
            </nav>
            <div className="app-header__actions">
              <button type="button" onClick={toggleDivider} aria-pressed={page.divider !== null}>
                Two columns
              </button>
              <button type="button" onClick={() => setClear((c) => !c)} aria-pressed={clear}>
                Clear
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPanelOpen((open) => !open)}
                aria-pressed={panelOpen}
                title={panelOpen ? "Hide canvas" : "Show canvas"}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <rect
                    x="2"
                    y="3.5"
                    width="14"
                    height="11"
                    rx="2.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <rect
                    x="10.5"
                    y="3.5"
                    width="5.5"
                    height="11"
                    rx="2.5"
                    fill="currentColor"
                    opacity="0.35"
                  />
                  <path d="M10.5 3.5v11" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </div>
          </header>
          <main className="desk" ref={deskRef}>
            {fit && (
              <TextPage
                key={page.id}
                size={notebook.pageSize}
                orientation={notebook.orientation}
                zoom={fit.zoom}
                margin={page.margin}
                columns={page.columns}
                divider={page.divider}
                clear={clear}
                onChange={session.setColumns}
              />
            )}
          </main>
        </>
      }
      panel={
        <Panel label="Canvas">
          <Canvas
            initial={canvasSnapshot ?? { elements: session.canvas.elements, files: session.files }}
            initialGridEnabled={session.canvas.gridEnabled}
            view={session.restoreView}
            onChange={session.onCanvasChange}
            onViewChange={session.onCanvasViewChange}
            onGridChange={session.onGridChange}
            onUnmount={setCanvasSnapshot}
          />
        </Panel>
      }
    />
  );
}
