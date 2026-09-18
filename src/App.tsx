import { useCallback, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { DrawingTools } from "./notebook/DrawingTools";
import { MediaPool } from "./notebook/MediaPool";
import { PAGE_BAR_HEIGHT, PageBar } from "./notebook/PageBar";
import { PageRail } from "./notebook/PageRail";
import { CoverSwatch } from "./notebook/CoverSwatch";
import { PageSettings } from "./notebook/PageSettings";
import { SearchBox } from "./notebook/SearchBox";
import { SettingsDialog } from "./notebook/SettingsDialog";
import { Shelf } from "./notebook/Shelf";
import { WelcomeDialog } from "./notebook/WelcomeDialog";
import { useNotebookSession } from "./notebook/useNotebookSession";
import { features } from "./features";
import { isBlankDocument } from "./page/document";
import { canAddPage } from "./notebook/pageRules";
import { TextPage } from "./page/TextPage";
import { ZinePage } from "./page/ZinePage";
import { defaultDivider, fitPage, mmToCssPx, pageGeometry, pageMm } from "./page/paper";
import { PageDrawing, type PageBox } from "./page/PageDrawing";
import {
  readDrawingAids,
  readDrawingMode,
  storeDrawingAids,
  storeDrawingMode,
  type DrawingAids,
} from "./page/drawingMode";
import { PAGE_BORDER_PX } from "./page/pageLook";
import { pageSide, spreadOf } from "./page/sides";
import { isZineEmpty } from "./page/zine";
import { exportFileName, exportPagePng, exportPdf } from "./notebook/export";
import { downloadBlob } from "./notebook/files";
import { nextTagColor } from "./notebook/tags";
import { fileUsage, isUsed } from "./notebook/pool";
import { notebookSize } from "./store/zip";
import { usePageThumbnail } from "./notebook/usePageThumbnail";
import { columnsKey, elementsKey } from "./store/autosave";
import { useElementSize } from "./page/useElementSize";
import { useAppearance } from "./shell/appearance";
import { IconButton } from "./shell/IconButton";
import { Menu } from "./shell/Menu";
import { Panel } from "./shell/Panel";
import { SplitView } from "./shell/SplitView";
import { shortcutLabel, useShortcuts } from "./shell/useShortcuts";
import { FileInUseError } from "./store/notebooks";
import { getTheme, isDarkTheme } from "./theme/themes";
import { Dots, Eye } from "./shell/icons";

const DESK_PADDING = 24;
/** Panel margins plus room for three pool columns. */
const MIN_PANEL_WIDTH = 320 + 12;
/** The main column must keep the desk wider than about 730px: the drawing editor needs it. */
const MIN_MAIN_WIDTH = 800;
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
  const { appearance, setAppearance } = useAppearance();
  const [preview, setPreview] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** The zine page whose media pool is open in the side panel; the panel closes with the page. */
  const [poolPageId, setPoolPageId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(
    () => readStoredWidth() ?? Math.round(window.innerWidth * 0.3),
  );
  // Drawing mode and its viewing aids are the browser's, never the page's: the mode
  // lasts the tab's session, the aids are kept across sessions.
  const [drawingMode, setDrawingModeState] = useState(readDrawingMode);
  const [aids, setAidsState] = useState<DrawingAids>(readDrawingAids);
  const [deskRef, desk] = useElementSize<HTMLElement>();
  const deskElement = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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

  const setDrawingMode = useCallback((on: boolean) => {
    setDrawingModeState(on);
    storeDrawingMode(on);
    // Drawing mode is for the page alone: the pool panel closes with it.
    if (on) setPoolPageId(null);
  }, []);
  const setAids = (patch: Partial<DrawingAids>) =>
    setAidsState((current) => {
      const next = { ...current, ...patch };
      storeDrawingAids(next);
      return next;
    });

  // The open page's thumbnail follows its content and its look. The key is everything
  // that changes how the page renders; nothing is rendered while the session loads, in
  // preview, or in drawing mode (the drawing is live then, not a still).
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
          elementsKey(current.drawing),
          current.drawingLayer,
          loaded.notebook.themeId,
          loaded.notebook.pageSize,
          loaded.notebook.orientation,
          current.divider,
          current.margin,
        ].join("|")
      : "",
    Boolean(loaded) && !preview && !drawingMode,
    loaded ? loaded.saveThumbnail : () => undefined,
  );

  // The shell's shortcuts mirror the page bar: page navigation, new page, drawing mode.
  // With zine pages behind their flag the zine chord stays claimed but does nothing.
  useShortcuts({
    previousPage: () => loaded?.goTo(loaded.index - 1),
    nextPage: () => loaded?.goTo(loaded.index + 1),
    newLinedPage: () => void loaded?.newPage("lined"),
    newZinePage: () => {
      if (features.zinePages) void loaded?.newPage("zine");
    },
    drawingMode: () => setDrawingMode(!drawingMode),
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
  /** The side panel exists for the media pool on zine pages only, and never while drawing. */
  const panelOpen = page.kind === "zine" && poolPageId === page.id && !drawingMode;
  // With the panel closed the desk shows the spread the open page belongs to: a left-hand
  // and a right-hand page touching at the gutter, like a notebook lying open. Page 1 is a
  // right-hand page, so the first spread is (inside cover | 1); an empty side, the inside
  // of a cover, is a slab in the cover colour.
  const spread = !panelOpen;
  const pair = spreadOf(index, pages.length);
  const slots: (number | null)[] = spread ? [pair.left, pair.right] : [index];
  // The page bar sits under the page, so the page is fitted above its height.
  const fit = desk
    ? fitPage(spread ? { width: geometry.width * 2, height: geometry.height } : geometry, {
        width: desk.width - 2 * DESK_PADDING,
        height: desk.height - 2 * DESK_PADDING - PAGE_BAR_HEIGHT,
      })
    : null;
  /** The corner radius of a page at the desk's zoom, for the slab. */
  const cornerPx = fit ? mmToCssPx(theme.page.cornerMm, fit.zoom) : 0;
  /** Top of the page in the desk: the sheet (page and bar) is centred vertically. */
  const pageTop = desk && fit ? Math.max(0, (desk.height - fit.height - PAGE_BAR_HEIGHT) / 2) : 0;
  /**
   * The app bar's right-hand group lines up with the right edge of the page or spread.
   * The bar and the workspace share the column's width, so the inset from the bar's right
   * edge is the desk's margin beside the sheet.
   */
  const barInset =
    desk && fit ? Math.max(DESK_PADDING, (desk.width - fit.width) / 2) : DESK_PADDING;

  /**
   * The open page's box in the desk, in CSS px: where the drawing editor pins its scene.
   * The sheet is centred on the desk, in a spread the right-hand page is the second half
   * of the sheet, and the page's content starts inside its border, so the box does too.
   */
  const pageBox: PageBox | null =
    desk && fit
      ? {
          x:
            (desk.width - fit.width) / 2 +
            slots.indexOf(index) * geometry.width * fit.zoom +
            PAGE_BORDER_PX,
          y: pageTop + PAGE_BORDER_PX,
          width: geometry.width * fit.zoom - 2 * PAGE_BORDER_PX,
          height: fit.height - 2 * PAGE_BORDER_PX,
        }
      : null;

  /** Makes another page of the spread the open one, before the pointer reaches its editor. */
  const openInSpread = (i: number) => {
    if (i !== index) flushSync(() => session.goTo(i));
  };

  /** In drawing mode a click on the other page of the spread opens it, through the editor. */
  const openAtDeskPoint = (point: { x: number; y: number }) => {
    if (!desk || !fit) return;
    const slot = Math.floor((point.x - (desk.width - fit.width) / 2) / (geometry.width * fit.zoom));
    const other = slots[slot];
    if (other !== undefined && other !== null && other !== index) session.goTo(other);
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
  /** The one-page rule: no new page while the open page is empty. */
  const canAdd = canAddPage(page);

  const setPadding = (padding: number) => {
    if (page.zine) session.setZine({ ...page.zine, padding });
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

  // Exports run on the pages as saved; failures are reported plainly.
  const exportSource = { notebook, files: session.files };
  const runExport = async (make: () => Promise<Blob>, name: string) => {
    try {
      downloadBlob(name, await make());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The export failed.");
    }
  };

  // Storage, for the settings dialog: from the session's state (the dormant canvas as
  // loaded), so a prune shows up at once.
  const storage = (() => {
    if (!settingsOpen) return { total: 0, images: 0, imageCount: 0, unusedCount: 0 };
    const size = notebookSize({ ...notebook, pages, canvas: session.canvas, files: session.files });
    const usage = fileUsage(pages, session.canvasFileIds);
    const unusedCount = Object.keys(session.files).filter((id) => {
      const use = usage.get(id);
      return !use || !isUsed(use);
    }).length;
    return { ...size, unusedCount };
  })();

  const openSettings = () => setSettingsOpen(true);

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
          <header className="app-header" style={{ paddingRight: barInset }}>
            <span className="wordmark">typestill</span>
            <div className="app-header__actions">
              <button
                type="button"
                className="notebook-button"
                onClick={openSettings}
                title="Notebook settings"
              >
                <CoverSwatch cover={notebook.cover} name={notebook.name} size={16} />
                <span className="notebook-button__name">{notebook.name}</span>
              </button>
              <SearchBox pages={pages} onOpenPage={session.goTo} />
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
              offsetTop={pageTop}
              tags={notebook.tags}
              filterTagId={filterTagId}
              onFilterChange={setFilterTagId}
              thumbnails={session.thumbnails}
            />
            <main className="desk" ref={attachDesk}>
              {fit && (
                <div className="desk__sheet" style={{ width: fit.width }}>
                  <div className={`desk__spread${spread ? " is-spread" : ""}`}>
                    {slots.map((i, slot) => {
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
                      // The open page is locked and dimmed in drawing mode; the other page
                      // of the spread shows its still as ever.
                      const drawingProps = {
                        drawing: shownPage.drawing,
                        drawingLayer: shownPage.drawingLayer,
                        drawingMode: drawingMode && isOpen ? aids : null,
                      };
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
                              {...drawingProps}
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
                              files={session.files}
                              {...drawingProps}
                              onChange={session.setColumns}
                              onDividerChange={(offset) => void session.setDivider(offset)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <PageBar
                    index={index}
                    count={pages.length}
                    onSelect={session.goTo}
                    previousShortcut={shortcutLabel("previousPage")}
                    nextShortcut={shortcutLabel("nextPage")}
                    canAdd={canAdd}
                    addShortcut={shortcutLabel("newLinedPage")}
                    zinePages={features.zinePages}
                    onAdd={(kind) => void session.newPage(kind)}
                    onDelete={() => void deletePage()}
                    drawing={drawingMode}
                    drawingShortcut={shortcutLabel("drawingMode")}
                    onToggleDrawing={() => setDrawingMode(!drawingMode)}
                    drawingTools={
                      <DrawingTools
                        aids={aids}
                        onAidsChange={setAids}
                        layer={page.drawingLayer}
                        onLayerChange={session.setDrawingLayer}
                      />
                    }
                    poolOpen={page.kind === "zine" ? panelOpen : null}
                    onTogglePool={() => setPoolPageId(panelOpen ? null : page.id)}
                  >
                    <PageSettings
                      page={page}
                      number={index + 1}
                      count={pages.length}
                      canChangeKind={pageIsEmpty}
                      showKind={features.zinePages}
                      onKindChange={(kind) => void session.setKind(kind)}
                      tags={notebook.tags}
                      onTagChange={session.setPageTag}
                      onNewTag={() => void newTag()}
                      onMarksChange={session.setPageMarks}
                      onMarginChange={(margin) => void session.setPageMargin(margin)}
                      twoColumns={page.divider !== null}
                      onTwoColumnsChange={setTwoColumns}
                      onPaddingChange={setPadding}
                    />
                  </PageBar>
                </div>
              )}
              {drawingMode && fit && pageBox && (
                <PageDrawing
                  key={`${session.loadId}:${page.id}`}
                  zoom={fit.zoom}
                  box={pageBox}
                  initial={{ elements: page.drawing, files: session.files }}
                  dark={isDarkTheme(theme)}
                  onChange={(content) => session.setDrawing(page.id, content, session.loadId)}
                  onUnmount={(content) => session.setDrawing(page.id, content, session.loadId)}
                  onOutsidePointerDown={openAtDeskPoint}
                />
              )}
            </main>
          </div>
        </>
      }
      panel={
        <Panel label="Media pool">
          <MediaPool
            files={session.files}
            pages={pages}
            canvasFileIds={session.canvasFileIds}
            canPlace={page.kind === "zine" && selectedCell !== null}
            onAddImages={(files) => void addImages(null, files)}
            onPlace={(fileId) => selectedCell !== null && session.placeFile(selectedCell, fileId)}
            onDelete={(fileId) => void deleteImage(fileId)}
          />
        </Panel>
      }
    />
  );
}
