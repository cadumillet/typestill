import { useCallback, useRef, useState } from "react";
import { Canvas, type CanvasContent } from "./canvas/Canvas";
import { PageSettings } from "./notebook/PageSettings";
import { SettingsDialog } from "./notebook/SettingsDialog";
import { useNotebookSession } from "./notebook/useNotebookSession";
import { TextPage } from "./page/TextPage";
import { defaultDivider, fitPage, pageGeometry, pageMm } from "./page/paper";
import { useElementSize } from "./page/useElementSize";
import { IconButton } from "./shell/IconButton";
import { Menu } from "./shell/Menu";
import { Panel } from "./shell/Panel";
import { SplitView } from "./shell/SplitView";
import { ChevronLeft, ChevronRight, Dots, Eye, NewPage, SidePanel } from "./shell/icons";

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
  const [preview, setPreview] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelWidth, setPanelWidth] = useState(
    () => readStoredWidth() ?? Math.round(window.innerWidth * 0.55),
  );
  // The drawing survives the panel closing: the editor hands it back on unmount. The
  // snapshot is tagged with the load it belongs to, so a restored notebook starts fresh.
  const [canvasSnapshot, setCanvasSnapshot] = useState<{
    loadId: number;
    content: CanvasContent;
  }>();
  const [deskRef, desk] = useElementSize<HTMLElement>();
  const fileInput = useRef<HTMLInputElement>(null);

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

  const openBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      await session.restoreBackup(file);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not open the backup.");
    }
  };

  const setTwoColumns = (enabled: boolean) => {
    const width = pageMm(notebook.pageSize, notebook.orientation).width;
    void session.setDivider(enabled ? defaultDivider(width, page.margin) : null);
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
            <nav className="page-nav" aria-label="Pages">
              <IconButton
                label="Previous page"
                onClick={() => session.goTo(index - 1)}
                disabled={index === 0}
              >
                <ChevronLeft />
              </IconButton>
              <span className="page-nav__label">
                {index + 1} / {pages.length}
              </span>
              <IconButton
                label="Next page"
                onClick={() => session.goTo(index + 1)}
                disabled={index === pages.length - 1}
              >
                <ChevronRight />
              </IconButton>
              <IconButton label="New page" onClick={() => void session.newPage()}>
                <NewPage />
              </IconButton>
            </nav>
            <span className="meta">{notebook.name}</span>
            <div className="app-header__actions">
              <PageSettings
                page={page}
                number={index + 1}
                count={pages.length}
                twoColumns={page.divider !== null}
                onTwoColumnsChange={setTwoColumns}
              />
              <Menu
                label="Notebook"
                items={[
                  { label: "Settings…", onSelect: () => setSettingsOpen(true) },
                  { label: "Download backup", onSelect: () => void session.downloadBackup() },
                  { label: "Open backup…", onSelect: () => fileInput.current?.click() },
                ]}
              >
                <Dots />
              </Menu>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void openBackup(file);
                }}
              />
              <IconButton label="Preview" pressed={preview} onClick={() => setPreview((p) => !p)}>
                <Eye />
              </IconButton>
              <IconButton
                label={panelOpen ? "Hide canvas" : "Show canvas"}
                pressed={panelOpen}
                onClick={() => setPanelOpen((open) => !open)}
              >
                <SidePanel />
              </IconButton>
            </div>
          </header>
          <SettingsDialog
            open={settingsOpen}
            notebook={notebook}
            onSave={session.updateSettings}
            onClose={() => setSettingsOpen(false)}
          />
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
                preview={preview}
                onChange={session.setColumns}
              />
            )}
          </main>
        </>
      }
      panel={
        <Panel label="Canvas">
          <Canvas
            key={session.loadId}
            initial={
              canvasSnapshot?.loadId === session.loadId
                ? canvasSnapshot.content
                : { elements: session.canvas.elements, files: session.files }
            }
            initialGridEnabled={session.canvas.gridEnabled}
            view={session.restoreView}
            onChange={(content) => session.onCanvasChange(content, session.loadId)}
            onViewChange={(view) => session.onCanvasViewChange(view, session.loadId)}
            onGridChange={session.onGridChange}
            onUnmount={(content) => setCanvasSnapshot({ loadId: session.loadId, content })}
          />
        </Panel>
      }
    />
  );
}
