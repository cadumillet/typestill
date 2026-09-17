import { useCallback, useState } from "react";
import { Canvas, type CanvasContent } from "./canvas/Canvas";
import { TextPage } from "./page/TextPage";
import { DEFAULT_MARGIN_MM, defaultDivider, fitPage, pageGeometry, pageMm } from "./page/paper";
import { useElementSize } from "./page/useElementSize";
import { Panel } from "./shell/Panel";
import { SplitView } from "./shell/SplitView";
import { columnsForDivider } from "./store/model";

// Phase 1, in memory: one page in the main column, the notebook's canvas in a side
// panel. Storage and page navigation come next.
const PAGE_SIZE = "A5";
const ORIENTATION = "portrait";
const MARGIN = DEFAULT_MARGIN_MM;
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
  const [columns, setColumns] = useState<string[]>([""]);
  const [divider, setDivider] = useState<number | null>(null);
  const [clear, setClear] = useState(false);
  // Excalidraw owns the grid toggle; the shell only remembers the last value.
  const [gridEnabled, setGridEnabled] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelWidth, setPanelWidth] = useState(
    () => readStoredWidth() ?? Math.round(window.innerWidth * 0.55),
  );
  // The drawing survives the panel closing: the editor hands it back on unmount.
  const [canvasSnapshot, setCanvasSnapshot] = useState<CanvasContent>();
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

  const handleWidth = useCallback((width: number) => {
    setPanelWidth(width);
    storeWidth(width);
  }, []);

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
              {PAGE_SIZE} · {ORIENTATION}
            </span>
            <div className="app-header__actions">
              <button type="button" onClick={toggleDivider} aria-pressed={divider !== null}>
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
        </>
      }
      panel={
        <Panel label="Canvas">
          <Canvas
            initial={canvasSnapshot}
            initialGridEnabled={gridEnabled}
            onGridChange={setGridEnabled}
            onUnmount={setCanvasSnapshot}
          />
        </Panel>
      }
    />
  );
}
