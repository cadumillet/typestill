import { useCallback, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { Canvas, type CanvasContent, type CanvasHandle } from "./canvas/Canvas";
import { MediaPool } from "./notebook/MediaPool";
import { PageRail } from "./notebook/PageRail";
import { NotebookSwitcher } from "./notebook/NotebookSwitcher";
import { PageSettings } from "./notebook/PageSettings";
import { SearchBox } from "./notebook/SearchBox";
import { SettingsDialog } from "./notebook/SettingsDialog";
import { Shelf } from "./notebook/Shelf";
import { WelcomeDialog } from "./notebook/WelcomeDialog";
import { useNotebookSession } from "./notebook/useNotebookSession";
import { isBlankDocument } from "./page/document";
import { TextPage } from "./page/TextPage";
import { ZinePage } from "./page/ZinePage";
import { defaultDivider, fitPage, mmToCssPx, pageGeometry, pageMm } from "./page/paper";
import { pageSide, spreadOf } from "./page/sides";
import { imagesForLayout, isZineEmpty, type Zine } from "./page/zine";
import { exportCanvasPng, exportFileName, exportPagePng, exportPdf } from "./notebook/export";
import { downloadBlob } from "./notebook/files";
import { nextTagColor } from "./notebook/tags";
import { fileUsage, isUsed } from "./notebook/pool";
import { notebookSize } from "./store/zip";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
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
  /** The canvas as it was when settings opened, for the storage figures. */
  const [settingsCanvas, setSettingsCanvas] = useState<readonly ExcalidrawElement[]>([]);
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
  /**
   * The latest drawing the mounted canvas reported, for the canvas export and the search,
   * without a render per stroke. Tagged with its load so another notebook's drawing is
   * never used.
   */
  const latestCanvas = useRef<{ loadId: number; content: CanvasContent } | null>(null);
  const [deskRef, desk] = useElementSize<HTMLElement>();
  const deskElement = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<CanvasHandle>(null);
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
  const loaded = session && !("firstRun" in session) && !("shelf" in session) ? session : null;
  const current = loaded?.page;
  usePageThumbnail(
    deskElement,
    current?.id ?? "",
    loaded && current
      ? [
          current.id,
          columnsKey(current.columns),
          JSON.stringify(current.zine ?? null),
          loaded.notebook.themeId,
          loaded.notebook.pageSize,
          loaded.notebook.orientation,
          current.divider,
          current.margin,
        ].join("|")
      : "",
    Boolean(loaded) && !preview,
    loaded ? loaded.saveThumbnail : () => undefined,
  );

  // The shell's shortcuts mirror the app bar: page navigation, new page, the panel.
  useShortcuts({
    previousPage: () => loaded?.goTo(loaded.index - 1),
    nextPage: () => loaded?.goTo(loaded.index + 1),
    newLinedPage: () => void loaded?.newPage("lined"),
    newZinePage: () => void loaded?.newPage("zine"),
    togglePanel: () => setPanelOpen((open) => !open),
  });

  if (!session) {
    return <div className="loading">Opening notebook…</div>;
  }

  // A true first run: storage holds no notebook. The welcome dialog makes the first one.
  if ("firstRun" in session) {
    return (
      <div className="loading">
        <WelcomeDialog
          onOpen={(name, cover) => session.createNotebook(name, cover)}
          onRestore={session.restoreBackup}
        />
      </div>
    );
  }

  // No notebook open: the shelf, where notebooks are made, renamed, deleted and opened.
  if ("shelf" in session) {
    const shelf = session;
    return (
      <Shelf
        notebooks={shelf.notebooks}
        onOpen={(id) => void shelf.openNotebook(id)}
        onCreate={(name, color) => void shelf.createNotebook(name, { color })}
        onRename={(id, name) => void shelf.renameNotebook(id, name)}
        onDelete={(id) => {
          const target = shelf.notebooks.find((n) => n.id === id);
          if (!target) return;
          const pages = `${target.pageCount} ${target.pageCount === 1 ? "page" : "pages"}`;
          if (
            window.confirm(
              `Delete the notebook "${target.name}" with its ${pages}, its canvas and its images? Only a backup file brings it back.`,
            )
          ) {
            void shelf.deleteNotebook(id);
          }
        }}
        onRestore={(file) =>
          void shelf.restoreBackup(file).catch((error: unknown) => {
            window.alert(error instanceof Error ? error.message : "Could not open the backup.");
          })
        }
      />
    );
  }

  const { notebook, pages, index, page } = session;
  const theme = getTheme(notebook.themeId);
  const geometry = pageGeometry(notebook.pageSize, notebook.orientation);
  // With the panel closed the desk shows the spread the open page belongs to: a left-hand
  // and a right-hand page touching at the gutter, like a notebook lying open. Page 1 is a
  // right-hand page, so the first spread is (inside cover | 1); an empty side, the inside
  // of a cover, is a slab in the cover colour.
  const spread = !panelOpen;
  const slots: (number | null)[] = spread
    ? [spreadOf(index, pages.length).left, spreadOf(index, pages.length).right]
    : [index];
  const fit = desk
    ? fitPage(spread ? { width: geometry.width * 2, height: geometry.height } : geometry, {
        width: desk.width - 2 * DESK_PADDING,
        height: desk.height - 2 * DESK_PADDING,
      })
    : null;
  /** The corner radius of a page at the desk's zoom, for the slab. */
  const cornerPx = fit ? mmToCssPx(theme.page.cornerMm, fit.zoom) : 0;

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

  // Deleting is by page id, so it reaches the real notebook whatever the rail's filter.
  const deletePage = async () => {
    const what =
      page.kind === "zine"
        ? "Its writing is removed from the notebook; its images stay in the media pool."
        : "Its writing is removed from the notebook.";
    const only =
      pages.length === 1
        ? " A fresh empty page takes its place, since a notebook keeps at least one page."
        : "";
    if (!window.confirm(`Delete page ${index + 1}? ${what}${only}`)) return;
    await session.deletePage();
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

  // Exports run on the saved pages and the latest drawing; failures are reported plainly.
  const exportSource = { notebook, files: session.files };
  const runExport = async (make: () => Promise<Blob>, name: string) => {
    try {
      downloadBlob(name, await make());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The export failed.");
    }
  };
  const currentCanvas = () =>
    latestCanvas.current?.loadId === session.loadId
      ? latestCanvas.current.content
      : canvasSnapshot?.loadId === session.loadId
        ? canvasSnapshot.content
        : { elements: session.canvas.elements, files: session.files };

  // Storage, for the settings dialog: from the session's state and the canvas as it was
  // when the dialog opened, so a prune shows up at once.
  const storage = (() => {
    if (!settingsOpen) return { total: 0, images: 0, imageCount: 0, unusedCount: 0 };
    const size = notebookSize({
      ...notebook,
      pages,
      canvas: { ...session.canvas, elements: [...settingsCanvas] },
      files: session.files,
    });
    const usage = fileUsage(pages, session.canvasFileIds);
    const unusedCount = Object.keys(session.files).filter((id) => {
      const use = usage.get(id);
      return !use || !isUsed(use);
    }).length;
    return { ...size, unusedCount };
  })();

  const openSettings = () => {
    setSettingsCanvas(currentCanvas().elements);
    setSettingsOpen(true);
  };

  const pruneImages = async () => {
    if (
      !window.confirm(
        `Remove ${storage.unusedCount} unused ${storage.unusedCount === 1 ? "image" : "images"} from the notebook? They are not on any page or the canvas.`,
      )
    ) {
      return;
    }
    await session.pruneImages();
  };

  const panelMode = peek?.pageId === page.id ? peek.mode : page.kind === "zine" ? "pool" : "canvas";

  /** The canvas's elements as the editor has them, or as loaded while it has not reported yet. */
  const canvasElements = () => currentCanvas().elements;

  /** Shows the canvas, whatever the panel was doing, and pans it to an element. */
  const openElement = (elementId: string) => {
    // Mounting the editor synchronously puts its handle in place; the editor itself
    // waits for its scene before jumping.
    flushSync(() => {
      setPanelOpen(true);
      setPeek({ pageId: page.id, mode: "canvas" });
    });
    canvasRef.current?.scrollTo(elementId);
  };
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
            <button
              type="button"
              className="wordmark wordmark--link"
              onClick={() => void session.closeNotebook()}
              title="Back to the shelf"
            >
              typestill
            </button>
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
              onShelf={() => void session.closeNotebook()}
            />
            <div className="app-header__actions">
              <SearchBox
                pages={pages}
                elements={canvasElements}
                onOpenPage={session.goTo}
                onOpenElement={openElement}
              />
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
                onDeletePage={() => void deletePage()}
              />
              <Menu
                label="Notebook"
                items={[
                  { label: "Settings…", onSelect: openSettings },
                  {
                    label: "Export PDF",
                    onSelect: () =>
                      void runExport(
                        () => exportPdf(pages, exportSource),
                        exportFileName(notebook, { kind: "pdf" }),
                      ),
                  },
                  {
                    label: "Export page as PNG",
                    onSelect: () =>
                      void runExport(
                        () => exportPagePng(pages, index, exportSource),
                        exportFileName(notebook, { kind: "page", number: index + 1 }),
                      ),
                  },
                  {
                    label: "Export canvas as PNG",
                    onSelect: () =>
                      void runExport(
                        () => {
                          const { elements, files } = currentCanvas();
                          return exportCanvasPng(elements, files);
                        },
                        exportFileName(notebook, { kind: "canvas" }),
                      ),
                  },
                  { label: "Download backup", onSelect: () => void session.downloadBackup() },
                  { label: "Open backup…", onSelect: () => fileInput.current?.click() },
                ]}
              >
                <Dots />
              </Menu>
              <input
                ref={fileInput}
                type="file"
                accept=".json,.zip,application/json,application/zip"
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
            storage={storage}
            onPruneImages={() => void pruneImages()}
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
            <main className={`desk${spread ? " is-spread" : ""}`} ref={attachDesk}>
              {fit &&
                slots.map((i, slot) => {
                  if (i === null) {
                    const side = slot === 0 ? "left" : "right";
                    return (
                      <div
                        key={`slab-${side}`}
                        className={`desk__slab desk__slab--${side}`}
                        style={
                          {
                            width: geometry.width * fit.zoom,
                            height: fit.height,
                            background: notebook.cover.color,
                            "--page-corner": `${cornerPx}px`,
                          } as CSSProperties
                        }
                        aria-hidden
                      />
                    );
                  }
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
                          number={shownPage.showPageNumber ? i + 1 : null}
                          side={pageSide(i)}
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
                          number={shownPage.showPageNumber ? i + 1 : null}
                          side={pageSide(i)}
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
              ref={canvasRef}
              initial={
                canvasSnapshot?.loadId === session.loadId
                  ? canvasSnapshot.content
                  : { elements: session.canvas.elements, files: session.files }
              }
              initialGridEnabled={session.canvas.gridEnabled}
              view={session.restoreView}
              onChange={(content) => {
                latestCanvas.current = { loadId: session.loadId, content };
                session.onCanvasChange(content, session.loadId);
              }}
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
