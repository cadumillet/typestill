import { useCallback, useRef, useState } from "react";
import { Canvas, type CanvasContent } from "./canvas/Canvas";
import { MediaPool } from "./notebook/MediaPool";
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
import { useAppearance } from "./shell/appearance";
import { IconButton } from "./shell/IconButton";
import { Menu } from "./shell/Menu";
import { Panel } from "./shell/Panel";
import { SplitView } from "./shell/SplitView";
import { FileInUseError } from "./store/notebooks";
import { getTheme } from "./theme/themes";
import {
  ChevronLeft,
  ChevronRight,
  Dots,
  Eye,
  Images,
  NewPage,
  Pencil,
  SidePanel,
} from "./shell/icons";

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
  const { appearance, scheme, setAppearance } = useAppearance();
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
  // The panel shows the media pool on zine pages and the canvas on lined pages. A peek
  // at the other lasts until the next page change, so it is tagged with its page.
  const [peek, setPeek] = useState<{ pageId: string; mode: "canvas" | "pool" } | null>(null);
  /** The zine cell chosen by clicking it, where a paste or a click in the pool lands. */
  const [chosenCell, setChosenCell] = useState<{ pageId: string; cell: number } | null>(null);

  const handleWidth = useCallback((width: number) => {
    setPanelWidth(width);
    storeWidth(width);
  }, []);

  if (!session) {
    return <div className="loading">Opening notebook…</div>;
  }

  const { notebook, pages, index, page } = session;
  const theme = getTheme(notebook.themeId);
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

  const addImages = async (cell: number | null, files: File[]) => {
    const added = await session.addImages(cell, files);
    if (added === 0) window.alert("None of these files could be read as an image.");
  };

  const deleteImage = async (fileId: string) => {
    if (!window.confirm("Delete this image from the notebook?")) return;
    try {
      await session.deleteImage(fileId);
    } catch (error) {
      window.alert(
        error instanceof FileInUseError
          ? "This image is in use on a page or the canvas. Replace it there first."
          : "Could not delete the image.",
      );
    }
  };

  const panelMode = peek?.pageId === page.id ? peek.mode : page.kind === "zine" ? "pool" : "canvas";
  const selectedCell = chosenCell?.pageId === page.id ? chosenCell.cell : null;
  const setSelectedCell = (cell: number | null) =>
    setChosenCell(cell === null ? null : { pageId: page.id, cell });

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
            appearance={appearance}
            onSave={(settings, nextAppearance) => {
              setAppearance(nextAppearance);
              return session.updateSettings(settings);
            }}
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
                  theme={theme}
                  zoom={fit.zoom}
                  zine={page.zine}
                  files={session.files}
                  preview={preview}
                  onChange={session.setZine}
                  onAddImages={(cell, files) => void addImages(cell, files)}
                  onPlaceFile={session.placeFile}
                  selectedCell={selectedCell}
                  onSelectCell={setSelectedCell}
                />
              )}
              {fit && page.kind === "lined" && (
                <TextPage
                  key={page.id}
                  size={notebook.pageSize}
                  orientation={notebook.orientation}
                  theme={theme}
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
        <Panel label={panelMode === "pool" ? "Media pool" : "Canvas"}>
          {panelMode === "pool" ? (
            <MediaPool
              files={session.files}
              pages={pages}
              canvasFileIds={session.canvasFileIds}
              canPlace={page.kind === "zine" && selectedCell !== null}
              onAddImages={(files) => void addImages(null, files)}
              onPlace={(fileId) => selectedCell !== null && session.placeFile(selectedCell, fileId)}
              onDelete={(fileId) => void deleteImage(fileId)}
            />
          ) : (
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
              resolveFile={(id) => session.files[id]}
              scheme={scheme}
            />
          )}
          <div className="panel__mode">
            <IconButton
              label={panelMode === "pool" ? "Show canvas" : "Show media pool"}
              onClick={() =>
                setPeek({ pageId: page.id, mode: panelMode === "pool" ? "canvas" : "pool" })
              }
            >
              {panelMode === "pool" ? <Pencil /> : <Images />}
            </IconButton>
          </div>
        </Panel>
      }
    />
  );
}
