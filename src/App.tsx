import { useCallback, useRef, useState } from "react";
import { Canvas, type CanvasContent } from "./canvas/Canvas";
import { PageRail } from "./notebook/PageRail";
import { NotebookSwitcher } from "./notebook/NotebookSwitcher";
import { PageSettings } from "./notebook/PageSettings";
import { SettingsDialog } from "./notebook/SettingsDialog";
import { useNotebookSession } from "./notebook/useNotebookSession";
import { isBlankDocument } from "./page/document";
import { TextPage } from "./page/TextPage";
import { ZinePage } from "./page/ZinePage";
import { defaultDivider, fitPage, pageGeometry, pageMm } from "./page/paper";
import { imagesForLayout, isZineEmpty, type Zine } from "./page/zine";
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

  const pageIsEmpty =
    page.kind === "zine"
      ? !page.zine || isZineEmpty(page.zine)
      : page.columns.every((column) => isBlankDocument(column.doc));

  // Settings that would drop images or text ask first; nothing is untied silently.
  const changeZine = (patch: Partial<Zine>) => {
    const zine = page.zine;
    if (!zine) return;
    const next = { ...zine, ...patch };
    if (patch.media && patch.media.layout !== zine.media.layout) {
      const images = imagesForLayout(zine.media.images, patch.media.layout);
      const dropped = zine.media.images.slice(images.length).filter(Boolean).length;
      if (
        dropped > 0 &&
        !window.confirm(
          `This layout has fewer cells. ${dropped === 1 ? "One image" : `${dropped} images`} will be taken off the page (they stay in the notebook). Continue?`,
        )
      ) {
        return;
      }
      next.media = { layout: patch.media.layout, images };
    }
    for (const block of ["textBelow", "textBeside"] as const) {
      const before = zine[block];
      if (patch[block] === null && before && !isBlankDocument(before.doc)) {
        if (!window.confirm("This text block has writing in it. Remove it?")) return;
      }
    }
    session.setZine(next);
  };

  const addImages = async (cell: number, files: File[]) => {
    const added = await session.addImages(cell, files);
    if (added === 0) window.alert("None of these files could be read as an image.");
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
              <Menu
                label="New page"
                items={[
                  { label: "Lined page", onSelect: () => void session.newPage("lined") },
                  { label: "Zine page", onSelect: () => void session.newPage("zine") },
                ]}
              >
                <NewPage />
              </Menu>
            </nav>
            <NotebookSwitcher
              notebooks={session.notebooks}
              currentId={notebook.id}
              currentPageCount={pages.length}
              onOpen={(id) => void session.openNotebook(id)}
              onCreate={(name) => void session.createNotebook(name)}
            />
            <div className="app-header__actions">
              <PageSettings
                page={page}
                number={index + 1}
                count={pages.length}
                canChangeKind={pageIsEmpty}
                onKindChange={(kind) => void session.setKind(kind)}
                twoColumns={page.divider !== null}
                onTwoColumnsChange={setTwoColumns}
                onZineChange={changeZine}
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
          <div className="workspace">
            <PageRail
              pages={pages}
              index={index}
              onSelect={session.goTo}
              offsetTop={desk && fit ? Math.max(0, (desk.height - fit.height) / 2) : 0}
            />
            <main className="desk" ref={deskRef}>
              {fit && page.kind === "zine" && page.zine && (
                <ZinePage
                  key={page.id}
                  size={notebook.pageSize}
                  orientation={notebook.orientation}
                  zoom={fit.zoom}
                  zine={page.zine}
                  files={session.files}
                  preview={preview}
                  onChange={session.setZine}
                  onAddImages={(cell, files) => void addImages(cell, files)}
                />
              )}
              {fit && page.kind === "lined" && (
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
          </div>
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
