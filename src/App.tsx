import { useCallback, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { DrawingTools } from "./notebook/DrawingTools";
import { SectionTabs, TAB_OUT_OPEN_MM } from "./notebook/SectionTabs";
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
import { canAddPage } from "./notebook/pageRules";
import { TextPage } from "./page/TextPage";
import { ZinePage } from "./page/ZinePage";
import {
  SCENE_PX_PER_MM,
  defaultDivider,
  fitPage,
  mmToCssPx,
  pageGeometry,
  pageMm,
} from "./page/paper";
import { PageDrawing, type PageBox } from "./page/PageDrawing";
import {
  readDrawingAids,
  readDrawingMode,
  storeDrawingAids,
  storeDrawingMode,
  type DrawingAids,
} from "./page/drawingMode";
import { PAGE_BORDER_PX } from "./page/pageLook";
import { pageSide, sideAt, sideIndexOfPage, sideSequence, spreadOf, type Side } from "./page/sides";
import { isZineEmpty } from "./page/zine";
import { exportFileName, exportPagePng, exportPdf } from "./notebook/export";
import { downloadBlob } from "./notebook/files";
import { nextSectionColor, sectionOf } from "./notebook/sections";
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
  /** The notebook box: the map, the sections, this page and the notebook's settings. */
  const [boxOpen, setBoxOpen] = useState(false);
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
    notebookBox: () => setBoxOpen(true),
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
  // The notebook's sides (src/page/sides.ts): with the panel closed the desk shows the
  // spread the open page belongs to, a left-hand and a right-hand side touching at the
  // gutter, like a notebook lying open. The other side may be a page (dimmed until it is
  // clicked), a section's divider leaf, a blank back or the inside of a cover, the last
  // three drawn as slabs.
  const sides = sideSequence(notebook.sections, pages);
  const sideIndex = sideIndexOfPage(sides, index);
  const spread = !panelOpen;
  const slots: Side[] = spread ? spreadOf(sides, sideIndex) : [{ kind: "page", index }];
  /** Which half of the sheet the open page is: 0 on the left, 1 on the right. */
  const openSlot = spread && sideAt(sideIndex) === "right" ? 1 : 0;
  // The page bar sits under the page, so the page is fitted above its height. With the
  // tabs experiment on, the fit reserves room on both sides for the tabs that stick out
  // past the page edges, so the sheet is the page or spread alone and the tabs overflow
  // it into that room.
  const sheetScene = spread ? geometry.width * 2 : geometry.width;
  const tabRoom = features.tabs ? TAB_OUT_OPEN_MM * SCENE_PX_PER_MM : 0;
  const fit = (() => {
    if (!desk) return null;
    const room = fitPage(
      { width: sheetScene + 2 * tabRoom, height: geometry.height },
      {
        width: desk.width - 2 * DESK_PADDING,
        height: desk.height - 2 * DESK_PADDING - PAGE_BAR_HEIGHT,
      },
    );
    return tabRoom === 0 ? room : { ...room, width: sheetScene * room.zoom };
  })();
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
          x: (desk.width - fit.width) / 2 + openSlot * geometry.width * fit.zoom + PAGE_BORDER_PX,
          y: pageTop + PAGE_BORDER_PX,
          width: geometry.width * fit.zoom - 2 * PAGE_BORDER_PX,
          height: fit.height - 2 * PAGE_BORDER_PX,
        }
      : null;

  /** The open page's section, in section order, for the tabs. */
  const openSectionIndex = notebook.sections.findIndex((s) => s.id === page.sectionId);

  /** Makes another page of the spread the open one, before the pointer reaches its editor. */
  const openInSpread = (i: number) => {
    if (i !== index) flushSync(() => session.goTo(i));
  };

  /** In drawing mode a click on the other page of the spread opens it, through the editor. */
  const openAtDeskPoint = (point: { x: number; y: number }) => {
    if (!desk || !fit) return;
    const slot = Math.floor((point.x - (desk.width - fit.width) / 2) / (geometry.width * fit.zoom));
    const other = slots[slot];
    if (other?.kind === "page" && other.index !== index) session.goTo(other.index);
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
          ? "This image is in use on a page. Replace it there first."
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

  /** "New section…" from the box's This page group: names a section and moves the page there. */
  const newSection = async () => {
    const name = window.prompt("Name for the new section", "Section")?.trim();
    if (!name) return;
    const section = await session.addSection({
      name,
      color: nextSectionColor(notebook.sections),
    });
    session.setPageSection(section.id);
  };

  // Deleting a section moves its pages to the section before it (after it, for the
  // first); the confirm names the count and where they go. The last section stays.
  const removeSection = async (sectionId: string) => {
    const at = notebook.sections.findIndex((s) => s.id === sectionId);
    const section = notebook.sections[at];
    if (!section || notebook.sections.length === 1) return;
    const target = notebook.sections[at === 0 ? 1 : at - 1];
    const count = pages.filter((p) => p.sectionId === sectionId).length;
    const pagesNote =
      count === 0
        ? " It has no pages."
        : ` ${count === 1 ? "Its page moves" : `Its ${count} pages move`} to "${target.name}".`;
    if (!window.confirm(`Delete the section "${section.name}"?${pagesNote}`)) return;
    await session.deleteSection(sectionId);
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
  /** The map's clicks open a page or a section and close the box. */
  const openFromMap = (go: () => void) => {
    setBoxOpen(false);
    go();
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
            sides={sides}
            thumbnails={session.thumbnails}
            onSelectPage={(i) => openFromMap(() => session.goTo(i))}
            onOpenSection={(sectionId) => openFromMap(() => void session.openSection(sectionId))}
            onAddSection={(input) => void session.addSection(input)}
            onUpdateSection={(sectionId, patch) => void session.updateSection(sectionId, patch)}
            onMoveSection={(sectionId, direction) => void session.moveSection(sectionId, direction)}
            onDeleteSection={(sectionId) => void removeSection(sectionId)}
            page={page}
            onSectionChange={session.setPageSection}
            onNewSection={() => void newSection()}
            twoColumns={page.kind === "lined" ? page.divider !== null : null}
            onTwoColumnsChange={setTwoColumns}
            showKind={features.zinePages}
            canChangeKind={pageIsEmpty}
            onKindChange={(kind) => void session.setKind(kind)}
            onPaddingChange={setPadding}
            onUpdateSettings={(patch) => void session.updateSettings(patch)}
            appearance={appearance}
            onAppearanceChange={setAppearance}
            storage={storage}
            onPruneImages={() => void pruneImages()}
          />
          <div className="workspace">
            <main className="desk" ref={attachDesk}>
              {fit && (
                <div className="desk__sheet" style={{ width: fit.width }}>
                  <div className={`desk__spread${spread ? " is-spread" : ""}`}>
                    {slots.map((shown, slot) => {
                      if (shown.kind !== "page") {
                        const side = slot === 0 ? "left" : "right";
                        // A divider's front is a slab in the section's colour with the
                        // name; its back is paper with a tab in the colour along the outer
                        // edge; a blank back is paper; the inside of a cover is plain. With
                        // the tabs experiment on, both faces of a divider are paper: the
                        // section's tab in its slot on the sheet's edge is the leaf's.
                        const paper =
                          shown.kind === "blank" ||
                          (shown.kind === "divider" && (features.tabs || shown.face === "back"));
                        const kind =
                          shown.kind === "cover"
                            ? " desk__slab--plain"
                            : paper && theme.page.border
                              ? " desk__slab--paper"
                              : "";
                        return (
                          <div
                            key={`slab-${side}`}
                            className={`desk__slab desk__slab--${side}${kind}`}
                            style={
                              {
                                width: geometry.width * fit.zoom,
                                height: fit.height,
                                background:
                                  shown.kind === "cover"
                                    ? undefined
                                    : paper
                                      ? theme.colours.paper
                                      : shown.section.color,
                                "--page-corner": `${cornerPx}px`,
                              } as CSSProperties
                            }
                            aria-hidden
                          >
                            {shown.kind === "divider" &&
                              shown.face === "front" &&
                              !features.tabs && (
                                <span className="desk__slab__name">{shown.section.name}</span>
                              )}
                            {shown.kind === "divider" &&
                              shown.face === "back" &&
                              !features.tabs && (
                                <span
                                  className="desk__slab__tab"
                                  style={{ background: shown.section.color }}
                                >
                                  {shown.section.name}
                                </span>
                              )}
                          </div>
                        );
                      }
                      const i = shown.index;
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
                              side={pageSide(sides, i)}
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
                              margin={margin}
                              columns={shownPage.columns}
                              divider={shownPage.divider}
                              preview={preview}
                              readOnly={!isOpen}
                              side={pageSide(sides, i)}
                              files={session.files}
                              {...drawingProps}
                              onChange={session.setColumns}
                              onDividerChange={(offset) => void session.setDivider(offset)}
                            />
                          )}
                        </div>
                      );
                    })}
                    {features.tabs && (
                      <SectionTabs
                        sections={notebook.sections}
                        openIndex={openSectionIndex}
                        size={notebook.pageSize}
                        orientation={notebook.orientation}
                        zoom={fit.zoom}
                        onOpenSection={(sectionId) => void session.openSection(sectionId)}
                      />
                    )}
                  </div>
                  <PageBar
                    index={index}
                    count={pages.length}
                    section={sectionOf(page, notebook.sections)}
                    onSelect={session.goTo}
                    previousShortcut={shortcutLabel("previousPage")}
                    nextShortcut={shortcutLabel("nextPage")}
                    onOpenMap={openBox}
                    mapShortcut={shortcutLabel("notebookBox")}
                    canAdd={canAdd}
                    addShortcut={shortcutLabel("newLinedPage")}
                    zinePages={features.zinePages}
                    onAdd={(kind) => void session.newPage(kind)}
                    onDelete={() => void deletePage()}
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
