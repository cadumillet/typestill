import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { DrawingTools } from "./notebook/DrawingTools";
import { MediaPool } from "./notebook/MediaPool";
import { PAGE_BAR_HEIGHT, PageBar } from "./notebook/PageBar";
import { CoverSwatch } from "./notebook/CoverSwatch";
import { SearchBox } from "./notebook/SearchBox";
import { NotebookBox } from "./notebook/NotebookBox";
import { Shelf } from "./notebook/Shelf";
import { WelcomeDialog } from "./notebook/WelcomeDialog";
import { useNotebookSession } from "./notebook/useNotebookSession";
import { features } from "./features";
import { isBlankDocument } from "./page/document";
import { Overview } from "./notebook/Overview";
import { useBackgroundThumbnails } from "./notebook/useBackgroundThumbnails";
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
import type { QuickLine } from "./page/quickLine";
import { quickLineElement } from "./page/quickLineElement";
import { readStroke } from "./page/drawingMode";
import { pageSide, spreadOf } from "./page/sides";
import { isZineEmpty } from "./page/zine";
import { exportFileName, exportPagePng, exportPdf } from "./notebook/export";
import { downloadBlob } from "./notebook/files";
import { nextSectionColor, sectionOf, sectionRange } from "./notebook/sections";
import { FirstSectionError, NotebookNotBlankError, SectionPastEndError } from "./store/notebooks";
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
  /** The notebook box: the sections, this page and the notebook's settings. */
  const [boxOpen, setBoxOpen] = useState(false);
  /** The overview over the desk: the notebook's spreads stacked. */
  const [overviewOpen, setOverviewOpen] = useState(false);
  /** The clean layout (Shift+?): the notebook alone, without the app bar and the page bar. */
  const [clean, setClean] = useState(false);
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
          loaded.notebook.themeId,
          loaded.notebook.pageSize,
          loaded.notebook.orientation,
          current.divider,
          loaded.notebook.defaults.margin,
        ].join("|")
      : "",
    Boolean(loaded) && !preview && !drawingMode,
    loaded ? loaded.saveThumbnail : () => undefined,
  );

  // While the overview is open, the pages it shows that have no thumbnail yet (pages
  // converted or never opened) get one rendered in the background, one at a time; never
  // in drawing mode, where the drawing is live.
  const thumbnailSource = useMemo(
    () => (loaded ? { notebook: loaded.notebook, files: loaded.files } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded?.notebook, loaded?.files],
  );
  const saveThumbnailOf = loaded?.saveThumbnail;
  useBackgroundThumbnails(
    Boolean(loaded) && overviewOpen && !drawingMode,
    loaded?.pages ?? [],
    loaded?.thumbnails ?? {},
    thumbnailSource,
    useCallback(
      (pageId: string, dataURL: string) => saveThumbnailOf?.(dataURL, pageId),
      [saveThumbnailOf],
    ),
  );

  // The shell's shortcuts mirror the page bar: page navigation, new page, drawing mode.
  // With zine pages behind their flag the zine chord stays claimed but does nothing.
  useShortcuts({
    previousPage: () => loaded?.goTo(loaded.index - 1),
    nextPage: () => loaded?.goTo(loaded.index + 1),
    drawingMode: () => setDrawingMode(!drawingMode),
    overview: () => setOverviewOpen((open) => !open),
    cleanLayout: () => setClean((on) => !on),
  });

  if (!session) {
    return <div className="loading">Opening notebook…</div>;
  }

  // A true first run: storage holds no notebook. The welcome dialog makes the first one.
  if ("firstRun" in session) {
    return (
      <div className="loading">
        <WelcomeDialog
          onOpen={(name, cover, size) => session.createNotebook(name, cover, size)}
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
  // right-hand page, so the spreads run (inside cover | 1), (2 | 3) … (N | inside back
  // cover); the inside of a cover is a plain slab, the other page is dimmed until clicked.
  const spread = !panelOpen;
  const pair = spreadOf(index, pages.length);
  const slots: (number | null)[] = spread ? [pair.left, pair.right] : [index];
  /** Which half of the sheet the open page is: 0 on the left, 1 on the right. */
  const openSlot = spread && pageSide(index) === "right" ? 1 : 0;
  // The page bar sits under the page, so the page is fitted above its height.
  const barHeight = PAGE_BAR_HEIGHT;
  const fit = desk
    ? fitPage(spread ? { width: geometry.width * 2, height: geometry.height } : geometry, {
        width: desk.width - 2 * DESK_PADDING,
        height: desk.height - 2 * DESK_PADDING - barHeight,
      })
    : null;
  /** The corner radius of a page at the desk's zoom, for the slab. */
  const cornerPx = fit ? mmToCssPx(theme.page.cornerMm, fit.zoom) : 0;
  /** Top of the page in the desk: the sheet (page and bar) is centred vertically. */
  const pageTop = desk && fit ? Math.max(0, (desk.height - fit.height - barHeight) / 2) : 0;
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
          x: (desk.width - fit.width) / 2 + openSlot * geometry.width * fit.zoom + PAGE_BORDER_PX,
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
    if (typeof other === "number" && other !== index) session.goTo(other);
  };

  const openBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      await session.restoreBackup(file);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not open the backup.");
    }
  };

  /** The margin line every page follows: the notebook's, not the page's stored one (section 8). */
  const margin = notebook.defaults.margin;

  const setTwoColumns = (enabled: boolean) => {
    const width = pageMm(notebook.pageSize, notebook.orientation).width;
    void session.setDivider(enabled ? defaultDivider(width, margin) : null);
  };

  const pageIsEmpty =
    page.kind === "zine"
      ? !page.zine || isZineEmpty(page.zine)
      : page.columns.every((column) => isBlankDocument(column.doc));
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
          ? "This image is in use on a page. Replace it there first."
          : "Could not delete the image.",
      );
    }
  };

  /** Clearing empties the page and keeps the slot; it asks first. */
  const clearPage = async () => {
    const what =
      page.kind === "zine"
        ? "Its writing and drawing are removed; its images stay in the media pool."
        : "Its writing and drawing are removed.";
    if (!window.confirm(`Clear page ${index + 1}? ${what} The page keeps its place.`)) return;
    await session.clearPage();
  };

  /** A store rule refused: said plainly. */
  const refused = (error: unknown) => {
    window.alert(
      error instanceof NotebookNotBlankError
        ? `${error.message}. The pages to drop must be blank.`
        : error instanceof SectionPastEndError
          ? `${error.message}. Move or remove the cut first.`
          : error instanceof FirstSectionError
            ? "The first section cannot move or be removed."
            : error instanceof Error
              ? error.message
              : "That is not allowed.",
    );
  };

  /** Adds a section at the end, out of the last sheet: named "Section", in the least-used colour. */
  const addSection = async () => {
    try {
      await session.addSection({ name: "Section", color: nextSectionColor(notebook.sections) });
    } catch (error) {
      refused(error);
    }
  };

  /** A sheet more or less at a section's end; the store's refusals are said plainly. */
  const resizeSection = async (sectionId: string, by: 1 | -1) => {
    try {
      if (by > 0) await session.appendSheet(sectionId);
      else await session.removeSheet(sectionId);
    } catch (error) {
      refused(error);
    }
  };

  // Removing a cut merges the section into the one before; the confirm names the pages
  // that merge and where they go. The first section stays.
  const removeCut = async (sectionId: string) => {
    const at = notebook.sections.findIndex((s) => s.id === sectionId);
    if (at < 1) return;
    const section = notebook.sections[at];
    const target = notebook.sections[at - 1];
    const range = sectionRange(notebook.sections, notebook.size, at);
    if (
      !window.confirm(
        `Remove the section "${section.name}"? Pages ${range.start + 1} to ${range.end} merge into "${target.name}".`,
      )
    ) {
      return;
    }
    try {
      await session.removeCut(sectionId);
    } catch (error) {
      refused(error);
    }
  };

  /** Grows or shrinks the notebook by whole sheets; a refused shrink says why. */
  const resizeNotebook = async (size: number) => {
    try {
      if (size > notebook.size) await session.growNotebook(size);
      else await session.shrinkNotebook(size);
    } catch (error) {
      refused(error);
    }
  };

  /**
   * A quick line drawn on the open page: an ordinary line element in the stroke last used
   * in drawing mode, appended to the page's drawing through the path drawing mode saves
   * by, so the still refreshes at once.
   */
  const addQuickLine = (line: QuickLine): string => {
    const element = quickLineElement(line, readStroke());
    session.setDrawing(
      page.id,
      { elements: [...page.drawing, element], files: {} },
      session.loadId,
    );
    return element.id;
  };
  /** Takes a quick line back: the page's drawing without that element. */
  const undoQuickLine = (id: string) =>
    session.setDrawing(
      page.id,
      { elements: page.drawing.filter((element) => element.id !== id), files: {} },
      session.loadId,
    );
  /** The quick line is allowed on the open page while nothing sits over it. */
  const quickLine =
    !preview && !drawingMode && !overviewOpen && !boxOpen ? addQuickLine : undefined;

  /** Opens a page from the overview and closes it. */
  const openFromOverview = (go: () => void) => {
    setOverviewOpen(false);
    go();
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

  // Storage, for the notebook box: from the session's state (the dormant canvas as
  // loaded), so a prune shows up at once.
  const storage = (() => {
    if (!boxOpen) return { total: 0, images: 0, imageCount: 0, unusedCount: 0 };
    const size = notebookSize({ ...notebook, pages, canvas: session.canvas, files: session.files });
    const usage = fileUsage(pages, session.canvasFileIds);
    const unusedCount = Object.keys(session.files).filter((id) => {
      const use = usage.get(id);
      return !use || !isUsed(use);
    }).length;
    return { ...size, unusedCount };
  })();

  const openBox = () => setBoxOpen(true);

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
          <header
            className={`app-header${clean ? " is-hidden" : ""}`}
            style={{ paddingRight: barInset }}
          >
            <span className="wordmark">typestill</span>
            <div className="app-header__actions">
              <button type="button" className="notebook-button" onClick={openBox} title="Notebook">
                <CoverSwatch cover={notebook.cover} name={notebook.name} size={16} />
                <span className="notebook-button__name">{notebook.name}</span>
              </button>
              <SearchBox pages={pages} onOpenPage={session.goTo} />
              <Menu
                label="Notebook"
                items={[
                  { label: "Notebook…", onSelect: openBox },
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
          <NotebookBox
            open={boxOpen}
            onClose={() => setBoxOpen(false)}
            notebook={notebook}
            pages={pages}
            index={index}
            onUpdateSection={(sectionId, patch) => void session.updateSection(sectionId, patch)}
            onAppendSheet={(sectionId) => void resizeSection(sectionId, 1)}
            onRemoveSheet={(sectionId) => void resizeSection(sectionId, -1)}
            onAddSection={() => void addSection()}
            onRemoveCut={(sectionId) => void removeCut(sectionId)}
            page={page}
            onClearPage={() => void clearPage()}
            twoColumns={page.kind === "lined" ? page.divider !== null : null}
            onTwoColumnsChange={setTwoColumns}
            showKind={features.zinePages}
            canChangeKind={pageIsEmpty}
            onKindChange={(kind) => void session.setKind(kind)}
            onPaddingChange={setPadding}
            onUpdateSettings={(patch) => void session.updateSettings(patch)}
            onResize={(size) => void resizeNotebook(size)}
            appearance={appearance}
            onAppearanceChange={setAppearance}
            storage={storage}
            onPruneImages={() => void pruneImages()}
          />
          <div className="workspace">
            <main className="desk" ref={attachDesk}>
              {fit && (
                <div className="desk__sheet" style={{ width: fit.width }}>
                  <div
                    className={`desk__spread${spread ? " is-spread" : ""}`}
                    style={{ "--page-corner": `${cornerPx}px` } as CSSProperties}
                  >
                    {slots.map((i, slot) => {
                      if (i === null) {
                        const side = slot === 0 ? "left" : "right";
                        return (
                          <div
                            key={`slab-${side}`}
                            className={`desk__slab desk__slab--${side} desk__slab--plain`}
                            style={
                              {
                                width: geometry.width * fit.zoom,
                                height: fit.height,
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
                              side={pageSide(i)}
                              {...drawingProps}
                              onChange={session.setZine}
                              onAddImages={(cell, files) => void addImages(cell, files)}
                              onPlaceFile={session.placeFile}
                              selectedCell={isOpen ? selectedCell : null}
                              onSelectCell={setSelectedCell}
                              onQuickLine={isOpen ? quickLine : undefined}
                              onQuickLineUndo={undoQuickLine}
                            />
                          ) : (
                            <TextPage
                              size={notebook.pageSize}
                              orientation={notebook.orientation}
                              theme={theme}
                              zoom={fit.zoom}
                              margin={margin}
                              columns={shownPage.columns}
                              divider={shownPage.divider}
                              preview={preview}
                              readOnly={!isOpen}
                              side={pageSide(i)}
                              files={session.files}
                              {...drawingProps}
                              onChange={session.setColumns}
                              onFill={(fill) => session.setFill(shownPage.id, fill)}
                              onDividerChange={(offset) => void session.setDivider(offset)}
                              onQuickLine={isOpen ? quickLine : undefined}
                              onQuickLineUndo={undoQuickLine}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <PageBar
                    hidden={clean}
                    index={index}
                    count={pages.length}
                    section={sectionOf(notebook.sections, page.position)}
                    onSelect={session.goTo}
                    previousShortcut={shortcutLabel("previousPage")}
                    nextShortcut={shortcutLabel("nextPage")}
                    overviewOpen={overviewOpen}
                    overviewShortcut={shortcutLabel("overview")}
                    onToggleOverview={() => setOverviewOpen((open) => !open)}
                    twoColumns={page.kind === "lined" ? page.divider !== null : null}
                    onTwoColumnsChange={setTwoColumns}
                    drawing={drawingMode}
                    drawingShortcut={shortcutLabel("drawingMode")}
                    onToggleDrawing={() => setDrawingMode(!drawingMode)}
                    drawingTools={<DrawingTools aids={aids} onAidsChange={setAids} />}
                    poolOpen={page.kind === "zine" ? panelOpen : null}
                    onTogglePool={() => setPoolPageId(panelOpen ? null : page.id)}
                  />
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
              {overviewOpen && (
                <Overview
                  notebook={notebook}
                  pages={pages}
                  index={index}
                  thumbnails={session.thumbnails}
                  onSelect={(i) => openFromOverview(() => session.goTo(i))}
                  onOpenSection={(sectionId) =>
                    openFromOverview(() => session.openSection(sectionId))
                  }
                  onClose={() => setOverviewOpen(false)}
                  clean={clean}
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
