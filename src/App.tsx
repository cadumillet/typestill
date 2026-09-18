import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { nextTagColor } from "./notebook/tags";
import { usePageThumbnail } from "./notebook/usePageThumbnail";
import { columnsKey } from "./store/autosave";
import { useElementSize } from "./page/useElementSize";
import { useAppearance } from "./shell/appearance";
import { IconButton } from "./shell/IconButton";
import { Menu } from "./shell/Menu";
import { Panel } from "./shell/Panel";
import { SplitView } from "./shell/SplitView";
import { shortcutLabel, useShortcuts } from "./shell/useShortcuts";
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
/** Gap between the two pages of a spread, in CSS px. */
const SPREAD_GAP = 16;
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
  const deskElement = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // The panel shows the media pool on zine pages and the canvas on lined pages. A peek
  // at the other lasts until the next page change, so it is tagged with its page.
  const [peek, setPeek] = useState<{ pageId: string; mode: "canvas" | "pool" } | null>(null);
  /** The zine cell chosen by clicking it, where a paste or a click in the pool lands. */
  const [chosenCell, setChosenCell] = useState<{ pageId: string; cell: number } | null>(null);
  /** The rail's tag filter; null shows every page. */
  const [filterTagId, setFilterTagId] = useState<string | null>(null);

  const handleWidth = useCallback((width: number) => {
    setPanelWidth(width);
    storeWidth(width);
  }, []);

  const attachDesk = useCallback(
    (node: HTMLElement | null) => {
      deskElement.current = node;
      deskRef(node);
    },
    [deskRef],
  );

  // The open page's thumbnail follows its content and its look. The key is everything
  // that changes how the page renders; nothing is rendered while the session loads.
  const current = session?.page;
  usePageThumbnail(
    deskElement,
    current?.id ?? "",
    session && current
      ? [
          current.id,
          columnsKey(current.columns),
          JSON.stringify(current.zine ?? null),
          session.notebook.themeId,
          session.notebook.pageSize,
          session.notebook.orientation,
          current.divider,
          current.margin,
        ].join("|")
      : "",
    Boolean(session) && !preview,
    session ? session.saveThumbnail : () => undefined,
  );

  // The shell's shortcuts mirror the app bar: page navigation, new page, the panel.
  useShortcuts({
    previousPage: () => session?.goTo(session.index - 1),
    nextPage: () => session?.goTo(session.index + 1),
    newLinedPage: () => void session?.newPage("lined"),
    newZinePage: () => void session?.newPage("zine"),
    togglePanel: () => setPanelOpen((open) => !open),
  });

  if (!session) {
    return <div className="loading">Opening notebook…</div>;
  }

  const { notebook, pages, index, page } = session;
  const theme = getTheme(notebook.themeId);
  const geometry = pageGeometry(notebook.pageSize, notebook.orientation);
  // With the panel closed the desk shows a spread: fixed pairs of consecutive pages, the
  // open page on its side of the pair, like a book lying open.
  const spread = !panelOpen;
  const spreadLeft = index - (index % 2);
  const shown = spread ? [spreadLeft, spreadLeft + 1].filter((i) => i < pages.length) : [index];
  const fit = desk
    ? fitPage(spread ? { width: geometry.width * 2, height: geometry.height } : geometry, {
        width: desk.width - 2 * DESK_PADDING - (spread ? SPREAD_GAP : 0),
        height: desk.height - 2 * DESK_PADDING,
      })
    : null;

  /** Makes another page of the spread the open one, before the pointer reaches its editor. */
  const openInSpread = (i: number) => {
    if (i !== index) flushSync(() => session.goTo(i));
  };

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

  const newTag = async () => {
    const name = window.prompt("Name for the new tag", "Tag")?.trim();
    if (!name) return;
    const tag = await session.addTag({ name, color: nextTagColor(notebook.tags) });
    session.setPageTag(tag.id);
  };

  const removeTag = async (tagId: string) => {
    const tag = notebook.tags.find((t) => t.id === tagId);
    const count = pages.filter((p) => p.tagId === tagId).length;
    const pagesNote =
      count === 0 ? "" : ` ${count === 1 ? "One page loses" : `${count} pages lose`} the tag.`;
    if (!window.confirm(`Delete the tag "${tag?.name ?? ""}"?${pagesNote}`)) return;
    await session.deleteTag(tagId);
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
                shortcut={shortcutLabel("previousPage")}
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
                shortcut={shortcutLabel("nextPage")}
                onClick={() => session.goTo(index + 1)}
                disabled={index === pages.length - 1}
              >
                <ChevronRight />
              </IconButton>
              <Menu
                label="New page"
                shortcut={shortcutLabel("newLinedPage")}
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
                tags={notebook.tags}
                onTagChange={session.setPageTag}
                onNewTag={() => void newTag()}
                onMarksChange={session.setPageMarks}
                onMarginChange={(margin) => void session.setPageMargin(margin)}
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
                shortcut={shortcutLabel("togglePanel")}
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
            onAddTag={(input) => void session.addTag(input)}
            onUpdateTag={(tagId, patch) => void session.updateTag(tagId, patch)}
            onDeleteTag={(tagId) => void removeTag(tagId)}
          />
          <div className="workspace">
            <PageRail
              pages={pages}
              index={index}
              onSelect={session.goTo}
              offsetTop={desk && fit ? Math.max(0, (desk.height - fit.height) / 2) : 0}
              tags={notebook.tags}
              filterTagId={filterTagId}
              onFilterChange={setFilterTagId}
              thumbnails={session.thumbnails}
            />
            <main
              className={`desk${spread ? " is-spread" : ""}`}
              ref={attachDesk}
              style={spread ? { gap: SPREAD_GAP } : undefined}
            >
              {fit &&
                shown.map((i) => {
                  const shownPage = pages[i];
                  const isOpen = i === index;
                  return (
                    <div
                      key={shownPage.id}
                      className={`desk__page${isOpen ? " is-open" : ""}`}
                      data-page-id={shownPage.id}
                      onPointerDownCapture={() => openInSpread(i)}
                    >
                      {shownPage.kind === "zine" && shownPage.zine ? (
                        <ZinePage
                          size={notebook.pageSize}
                          orientation={notebook.orientation}
                          theme={theme}
                          zoom={fit.zoom}
                          zine={shownPage.zine}
                          files={session.files}
                          preview={preview}
                          readOnly={!isOpen}
                          date={shownPage.showDate ? new Date(shownPage.createdAt) : null}
                          number={shownPage.showPageNumber ? i + 1 : null}
                          onChange={session.setZine}
                          onAddImages={(cell, files) => void addImages(cell, files)}
                          onPlaceFile={session.placeFile}
                          selectedCell={isOpen ? selectedCell : null}
                          onSelectCell={setSelectedCell}
                        />
                      ) : (
                        <TextPage
                          size={notebook.pageSize}
                          orientation={notebook.orientation}
                          theme={theme}
                          zoom={fit.zoom}
                          margin={shownPage.margin}
                          columns={shownPage.columns}
                          divider={shownPage.divider}
                          preview={preview}
                          readOnly={!isOpen}
                          date={shownPage.showDate ? new Date(shownPage.createdAt) : null}
                          number={shownPage.showPageNumber ? i + 1 : null}
                          onChange={session.setColumns}
                          onDividerChange={(offset) => void session.setDivider(offset)}
                        />
                      )}
                    </div>
                  );
                })}
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
