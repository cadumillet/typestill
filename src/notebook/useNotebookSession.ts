import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasContent } from "../canvas/Canvas";
import type { DrawingContent } from "../page/PageDrawing";
import { createAutosave, columnsKey, elementsKey, type Autosave } from "../store/autosave";
import { backupFileName, parseBackup, serializeBackup } from "../store/backup";
import { isZipBackup, packBackupZip, unpackBackupZip, zipBackupFileName } from "../store/zip";
import { getDb, type TypestillDb } from "../store/db";
import { clampMargin, pageMm, snapDivider } from "../page/paper";
import { placeImages, type Zine } from "../page/zine";
import { getTheme } from "../theme/themes";
import { pageFill, zineFill } from "./fill";
import {
  columnsForDivider,
  referencedFileIds,
  type Canvas,
  type CanvasView,
  type Column,
  type Notebook,
  type Page,
  type PageKind,
  type Section,
} from "../store/model";
import {
  addFile,
  addSectionAtEnd as addSectionAtEndRecord,
  appendSheet as appendSheetRecord,
  clearPage as clearPageRecord,
  createNotebook as createNotebookRecord,
  deleteFile,
  deleteNotebook as deleteNotebookRecord,
  exportNotebook,
  getCanvas,
  getNotebook,
  growNotebook as growNotebookRecord,
  importNotebook,
  listNotebooks,
  listPages,
  loadNotebookFiles,
  loadThumbnails,
  pruneFiles,
  removeCut as removeCutRecord,
  removeSheet as removeSheetRecord,
  renameNotebook as renameNotebookRecord,
  saveCanvasContent,
  savePageDrawing,
  savePageText,
  savePageZine,
  saveThumbnail as saveThumbnailRecord,
  setCanvasGrid,
  setLastPage,
  setPageDivider,
  setPageKind,
  setSectionLastPage,
  shrinkNotebook as shrinkNotebookRecord,
  touchNotebook,
  updateNotebookSettings,
  updatePage,
  updateSection as updateSectionRecord,
  type NotebookSummary,
} from "../store/notebooks";
import { sectionOf } from "./sections";
import type { Cover } from "./cover";
import { downloadBlob, downloadText } from "./files";
import { importImage } from "./images";

export interface NotebookSession {
  notebook: Notebook;
  /** Every notebook in storage, most recently opened first. Refreshed when one is opened. */
  notebooks: NotebookSummary[];
  /** The pages in notebook order: section order, then creation order. Everything walks this. */
  pages: Page[];
  index: number;
  page: Page;
  /** The canvas as loaded. The editor reads it once; later changes live in the editor. */
  canvas: Canvas;
  files: Record<string, BinaryFileData>;
  /** File ids the canvas's image elements use right now. Feeds the media pool's usage. */
  canvasFileIds: string[];
  /** Rendered page thumbnails by page id, a cache the rail shows on hover. */
  thumbnails: Record<string, string>;
  /** The view the open page remembers. Changes only when a page is opened. */
  restoreView: CanvasView | null;
  /** Increments each time a notebook is loaded. Key the canvas editor by it so it starts over. */
  loadId: number;
  goTo: (index: number) => void;
  /**
   * Empties the open page's writing and drawing, keeping the slot: the notebook has its
   * pages. The caller asks first. Images a zine page used stay in the notebook's files.
   */
  clearPage: () => Promise<void>;
  setColumns: (columns: Column[]) => void;
  /**
   * A page's content fill as the page measured it (a lined page's lines used over the
   * lines available), from which the page's fill is kept: a drawing alone counts for a
   * quarter. Saved with the page's content; a page not open saves it straight away.
   */
  setFill: (pageId: string, contentFill: number) => void;
  setDivider: (divider: number | null) => Promise<void>;
  /** Zine pages: the media block and its text. */
  setZine: (zine: Zine) => void;
  /** Changes the open page's kind. Only an empty page can change; the store refuses otherwise. */
  setKind: (kind: PageKind) => Promise<void>;
  /**
   * Imports images into the notebook's files (downscaled, keyed by content) and, given a
   * cell, places them on the open zine page: the first in that cell, the rest in the
   * empty cells after it. Returns how many images were read; files the browser cannot
   * decode are skipped.
   */
  addImages: (cell: number | null, files: File[]) => Promise<number>;
  /** Puts an image from the pool into a cell of the open zine page. */
  placeFile: (cell: number, fileId: string) => void;
  /** Removes an image from the notebook. Throws FileInUseError while a page or the canvas uses it. */
  deleteImage: (fileId: string) => Promise<void>;
  /**
   * Sections are cuts on sheet boundaries (src/notebook/sections.ts), edited by their
   * length in sheets. Every edit changes the sections alone; the store enforces the rules
   * and throws.
   */
  updateSection: (
    sectionId: string,
    patch: Partial<Pick<Section, "name" | "color">>,
  ) => Promise<void>;
  /** A sheet more or less at the section's end; the last section absorbs the difference. */
  appendSheet: (sectionId: string) => Promise<void>;
  removeSheet: (sectionId: string) => Promise<void>;
  /** A new section at the end, out of the last section's last sheet. */
  addSection: (input: { name: string; color: string }) => Promise<void>;
  /** Removes a cut: its pages merge into the section before. The caller asks first. */
  removeCut: (sectionId: string) => Promise<void>;
  /** Opens a section where it was left (its remembered page, else its first page). */
  openSection: (sectionId: string) => void;
  /**
   * Grows the notebook to a larger multiple of four pages, appending blank ones; shrinks
   * it to a smaller one, which the store refuses (throwing) unless the pages to drop are
   * blank and no section starts past the new end.
   */
  growNotebook: (size: number) => Promise<void>;
  shrinkNotebook: (size: number) => Promise<void>;
  /** The open page's date stamp and page number toggles. */
  setPageMarks: (patch: Partial<Pick<Page, "showPageNumber">>) => void;
  /** Moves the open page's margin line; the divider is re-snapped if the margin pushes on it. */
  setPageMargin: (margin: number) => Promise<void>;
  /** Stores a fresh thumbnail of the open page. */
  saveThumbnail: (dataURL: string) => void;
  /**
   * A page's drawing as its editor reports it, tagged with the editor's loadId (stale
   * editors are ignored) and the page it draws on, since an editor reports its last
   * state while the page it belonged to is being left. Saved through the page autosave,
   * keyed by element versions; files new image elements use join the notebook's.
   */
  setDrawing: (pageId: string, content: DrawingContent, loadId: number) => void;
  /** Canvas callbacks carry the loadId of the editor that sent them; stale editors are ignored (dormant, section 8). */
  onCanvasChange: (content: CanvasContent, loadId: number) => void;
  onCanvasViewChange: (view: CanvasView, loadId: number) => void;
  onGridChange: (enabled: boolean) => void;
  /** Saves everything pending, then opens another notebook at its remembered page. */
  openNotebook: (id: string) => Promise<void>;
  /** Saves everything pending and puts the notebook back on the shelf. */
  closeNotebook: () => Promise<void>;
  /** Creates a notebook with all its pages, blank, and opens it at the first. */
  createNotebook: (name: string, cover?: Partial<Cover>, size?: number) => Promise<void>;
  /**
   * The name and cover, the theme, the page size and orientation of every page, and the
   * defaults for new pages, any of them. The margin line default is the margin every page
   * follows, so a change to it re-snaps the dividers it pushes on.
   */
  updateSettings: (
    settings: Partial<
      Pick<Notebook, "name" | "cover" | "themeId" | "pageSize" | "orientation" | "defaults">
    >,
  ) => Promise<void>;
  /**
   * Saves everything pending, then offers the notebook as a backup file: a zip with the
   * images as files when the notebook has any, else one JSON document.
   */
  downloadBackup: () => Promise<void>;
  /** Removes the images no page and not the canvas uses. Returns how many went. */
  pruneImages: () => Promise<number>;
  /**
   * Opens a backup file in place of the open notebook, after asking: the backup's
   * notebook is imported (over the stored one of the same id, if any), the notebook that
   * was open is deleted when the ids differ, so nothing invisible is left in storage,
   * and the imported one is opened. With no notebook open (the first run, the dormant
   * shelf) it only asks before overwriting a stored notebook of the same id. Throws
   * BackupError for files that are not valid backups.
   */
  restoreBackup: (file: File) => Promise<void>;
}

/**
 * What the hook returns on a true first run, when storage holds no notebook: the app
 * shows the welcome dialog, and one of these two calls turns into a loaded session.
 */
export interface FirstRun {
  firstRun: true;
  createNotebook: NotebookSession["createNotebook"];
  restoreBackup: NotebookSession["restoreBackup"];
}

/**
 * What the hook returns while no notebook is open (a destination reached from the
 * switcher, or the fallback when the last notebook fails to open): the shelf, where notebooks are
 * created, renamed, deleted and opened. This is where the app starts.
 */
export interface Shelf {
  shelf: true;
  notebooks: NotebookSummary[];
  openNotebook: (id: string) => Promise<void>;
  createNotebook: NotebookSession["createNotebook"];
  renameNotebook: (id: string, name: string) => Promise<void>;
  /** Deletes the notebook with everything in it. The caller asks first. */
  deleteNotebook: (id: string) => Promise<void>;
  restoreBackup: NotebookSession["restoreBackup"];
}

interface Loaded {
  loadId: number;
  notebook: Notebook;
  notebooks: NotebookSummary[];
  pages: Page[];
  index: number;
  canvas: Canvas;
  files: Record<string, BinaryFileData>;
  canvasFileIds: string[];
  thumbnails: Record<string, string>;
  restoreView: CanvasView | null;
}

const viewKey = (view: CanvasView) => `${view.scrollX},${view.scrollY},${view.zoom}`;

const report = (error: unknown) => console.error("typestill: save failed", error);

/**
 * Opens the most recently used notebook and keeps it saved: page text and page drawings
 * are autosaved as they change (the dormant canvas and its per-page view likewise).
 * Returns null until storage has been read, a FirstRun while it holds no notebook, the
 * Shelf while none is open, and the session once one is.
 */
export function useNotebookSession(
  db: TypestillDb = getDb(),
): NotebookSession | Shelf | FirstRun | null {
  const [state, setState] = useState<Loaded | null>(null);
  /** Storage was read and holds no notebook. Cleared as soon as one is loaded. */
  const [firstRun, setFirstRun] = useState(false);
  /** The shelf's listing while no notebook is open; null while storage is being read. */
  const [shelf, setShelf] = useState<NotebookSummary[] | null>(null);
  // The page savers carry the fill with the content, so a page's fill is written in the
  // same record update as what filled it.
  const pageSaver = useRef<Autosave<{ columns: Column[]; fill: number }> | null>(null);
  const zineSaver = useRef<Autosave<{ zine: Zine; fill: number }> | null>(null);
  const viewSaver = useRef<Autosave<CanvasView> | null>(null);
  /** The open page's drawing saver, with the page it belongs to. */
  const drawingSaver = useRef<{
    pageId: string;
    saver: Autosave<{ content: DrawingContent; fill: number }>;
  } | null>(null);
  const canvasSaver = useRef<Autosave<CanvasContent> | null>(null);
  /** The open page's columns as last set, for a fill that arrives on its own. */
  const latestColumns = useRef<Column[]>([]);
  /**
   * Each page's content fill as its editor last measured it (a lined page's lines, a
   * zine page's blocks), by page id; a page's fill is that plus its drawing. A page not
   * measured yet keeps the fill it was stored with.
   */
  const contentFills = useRef(new Map<string, number>());
  /** Pages dropped this session (by shrinking): a drawing editor leaving one has nothing to save. */
  const deletedPages = useRef(new Set<string>());
  /** Latest canvas view seen, written onto the page when it is left. */
  const latestView = useRef<CanvasView | null>(null);
  const loads = useRef(0);

  const flushAll = useCallback(() => {
    void pageSaver.current?.flush();
    void zineSaver.current?.flush();
    void viewSaver.current?.flush();
    void drawingSaver.current?.saver.flush();
    void canvasSaver.current?.flush();
  }, []);

  /** Points the page savers at a page. Flushes whatever the previous page still had. */
  const attachPage = useCallback(
    (page: Page) => {
      void pageSaver.current?.flush();
      void zineSaver.current?.flush();
      void viewSaver.current?.flush();
      void drawingSaver.current?.saver.flush();
      pageSaver.current = createAutosave<{ columns: Column[]; fill: number }>({
        save: ({ columns, fill }) => savePageText(db, page.id, columns, fill),
        key: ({ columns, fill }) => `${columnsKey(columns)}|${fill}`,
        onError: report,
      });
      pageSaver.current.markClean({ columns: page.columns, fill: page.fill });
      latestColumns.current = page.columns;
      zineSaver.current = null;
      if (page.zine) {
        zineSaver.current = createAutosave<{ zine: Zine; fill: number }>({
          save: ({ zine, fill }) => savePageZine(db, page.id, zine, fill),
          key: ({ zine, fill }) => `${JSON.stringify(zine)}|${fill}`,
          onError: report,
        });
        zineSaver.current.markClean({ zine: page.zine, fill: page.fill });
        contentFills.current.set(page.id, zineFill(page.zine));
      }
      viewSaver.current = createAutosave<CanvasView>({
        save: (view) => updatePage(db, page.id, { canvasView: view }),
        key: viewKey,
        delayMs: 800,
        onError: report,
      });
      if (page.canvasView) viewSaver.current.markClean(page.canvasView);
      latestView.current = page.canvasView;
      const saver = createAutosave<{ content: DrawingContent; fill: number }>({
        save: ({ content, fill }) =>
          savePageDrawing(db, page.id, content.elements, content.files, fill),
        key: ({ content, fill }) => `${elementsKey(content.elements)}|${fill}`,
        onError: report,
      });
      saver.markClean({ content: { elements: page.drawing, files: {} }, fill: page.fill });
      drawingSaver.current = { pageId: page.id, saver };
    },
    [db],
  );

  /** Stops all saving. Used before the stored notebook changes under the session. */
  const detach = useCallback(async () => {
    await Promise.all([
      pageSaver.current?.flush(),
      zineSaver.current?.flush(),
      viewSaver.current?.flush(),
      drawingSaver.current?.saver.flush(),
      canvasSaver.current?.flush(),
    ]);
    pageSaver.current = null;
    zineSaver.current = null;
    viewSaver.current = null;
    drawingSaver.current = null;
    canvasSaver.current = null;
  }, []);

  /** Opens a notebook: loads it, points the savers at it, and shows its remembered page. */
  const load = useCallback(
    async (notebookId: string) => {
      const [notebook, stored, canvas, files, thumbnails] = await Promise.all([
        getNotebook(db, notebookId),
        listPages(db, notebookId),
        getCanvas(db, notebookId),
        loadNotebookFiles(db, notebookId),
        loadThumbnails(db, notebookId),
      ]);
      if (!notebook) throw new Error(`Notebook ${notebookId} not found`);
      await touchNotebook(db, notebookId);
      const notebooks = await listNotebooks(db);
      const pages = stored;
      const remembered = pages.findIndex((page) => page.id === notebook.lastPageId);
      const index = remembered >= 0 ? remembered : 0;
      canvasSaver.current = createAutosave<CanvasContent>({
        save: (content) => saveCanvasContent(db, notebookId, content.elements, content.files),
        key: (content) => elementsKey(content.elements),
        onError: report,
      });
      canvasSaver.current.markClean({ elements: canvas.elements, files });
      attachPage(pages[index]);
      loads.current += 1;
      setFirstRun(false);
      setShelf(null);
      setState({
        loadId: loads.current,
        notebook,
        notebooks,
        pages,
        index,
        canvas,
        files,
        canvasFileIds: referencedFileIds(canvas.elements),
        thumbnails,
        restoreView: pages[index].canvasView,
      });
    },
    [db, attachPage],
  );

  // Start where the owner left off: the notebook opened last, at its remembered page.
  // With nothing in storage this is a first run: the welcome dialog creates the notebook
  // (or restores a backup) instead of the hook. A notebook that fails to open leaves
  // the app on the shelf, where the others still are.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listNotebooks(db);
      if (cancelled) return;
      if (list.length === 0) {
        setFirstRun(true);
        return;
      }
      try {
        await load(list[0].id);
      } catch (error) {
        report(error);
        if (!cancelled) setShelf(list);
      }
    })().catch(report);
    return () => {
      cancelled = true;
    };
  }, [db, load]);

  // Nothing pending is lost when the tab goes away or is hidden.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) flushAll();
    };
    window.addEventListener("beforeunload", flushAll);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", flushAll);
      document.removeEventListener("visibilitychange", onHide);
      flushAll();
    };
  }, [flushAll]);

  /** Puts the open page's section and the notebook in step with the page being opened. */
  const rememberOpen = useCallback(
    (current: Loaded): Loaded => {
      const page = current.pages[current.index];
      const sectionId = sectionOf(current.notebook.sections, page.position).id;
      setLastPage(db, current.notebook.id, page.id).catch(report);
      setSectionLastPage(db, current.notebook.id, sectionId, page.id).catch(report);
      return {
        ...current,
        notebook: {
          ...current.notebook,
          sections: current.notebook.sections.map((section) =>
            section.id === sectionId ? { ...section, lastPageId: page.id } : section,
          ),
        },
      };
    },
    [db],
  );

  const goTo = useCallback(
    (index: number) => {
      setState((current) => {
        if (!current || index < 0 || index >= current.pages.length || index === current.index) {
          return current;
        }
        const pages = current.pages.map((page, i) =>
          i === current.index ? { ...page, canvasView: latestView.current } : page,
        );
        attachPage(pages[index]);
        return rememberOpen({ ...current, pages, index, restoreView: pages[index].canvasView });
      });
    },
    [rememberOpen, attachPage],
  );

  /** A page's fill from its measured content and its drawing. */
  const fillOf = useCallback((page: Page, contentFill?: number) => {
    const content =
      contentFill ??
      contentFills.current.get(page.id) ??
      (page.kind === "zine" && page.zine ? zineFill(page.zine) : page.fill);
    return pageFill(content, page.drawing.length > 0);
  }, []);

  // The columns are saved with the page's fill as last measured; the column reports the
  // new measurement right after, and setFill brings the fill along.
  const setColumns = useCallback(
    (columns: Column[]) => {
      latestColumns.current = columns;
      setState((current) => {
        if (!current) return current;
        const page = current.pages[current.index];
        const fill = fillOf(page);
        pageSaver.current?.onChange({ columns, fill });
        const pages = current.pages.map((p, i) =>
          i === current.index ? { ...p, columns, fill } : p,
        );
        return { ...current, pages };
      });
    },
    [fillOf],
  );

  const setFill = useCallback(
    (pageId: string, contentFill: number) => {
      contentFills.current.set(pageId, contentFill);
      setState((current) => {
        if (!current) return current;
        const at = current.pages.findIndex((page) => page.id === pageId);
        if (at < 0) return current;
        const page = current.pages[at];
        const fill = fillOf(page, contentFill);
        if (fill === page.fill) return current;
        if (at === current.index) {
          pageSaver.current?.onChange({ columns: latestColumns.current, fill });
        } else {
          updatePage(db, pageId, { fill }).catch(report);
        }
        const pages = current.pages.map((p, i) => (i === at ? { ...p, fill } : p));
        return { ...current, pages };
      });
    },
    [db, fillOf],
  );

  const setDivider = useCallback(
    async (divider: number | null) => {
      if (!state) return;
      const page = state.pages[state.index];
      await pageSaver.current?.flush();
      await setPageDivider(db, page.id, divider);
      const columns = columnsForDivider(page.columns, divider);
      latestColumns.current = columns;
      pageSaver.current?.markClean({ columns, fill: page.fill });
      setState((current) => {
        if (!current) return current;
        const pages = current.pages.map((p, i) =>
          i === current.index ? { ...p, divider, columns } : p,
        );
        return { ...current, pages };
      });
    },
    [db, state],
  );

  const setZine = useCallback((zine: Zine) => {
    setState((current) => {
      if (!current) return current;
      const page = current.pages[current.index];
      contentFills.current.set(page.id, zineFill(zine));
      const fill = pageFill(zineFill(zine), page.drawing.length > 0);
      zineSaver.current?.onChange({ zine, fill });
      const pages = current.pages.map((p, i) => (i === current.index ? { ...p, zine, fill } : p));
      return { ...current, pages };
    });
  }, []);

  const setKind = useCallback(
    async (kind: PageKind) => {
      if (!state) return;
      const page = state.pages[state.index];
      if (page.kind === kind) return;
      await Promise.all([pageSaver.current?.flush(), zineSaver.current?.flush()]);
      const changed = await setPageKind(db, page.id, kind);
      attachPage(changed);
      setState((current) => {
        if (!current) return current;
        const pages = current.pages.map((p, i) => (i === current.index ? changed : p));
        return { ...current, pages };
      });
    },
    [db, state, attachPage],
  );

  const addImages = useCallback(
    async (cell: number | null, files: File[]) => {
      if (!state) return 0;
      const notebookId = state.notebook.id;
      const pageId = state.pages[state.index].id;
      const ids: string[] = [];
      const added: Record<string, BinaryFileData> = {};
      for (const file of files) {
        try {
          const data = await importImage(file);
          await addFile(db, notebookId, data);
          added[data.id] = data;
          ids.push(data.id);
        } catch (error) {
          console.warn("typestill: could not import image", file.name, error);
        }
      }
      if (ids.length === 0) return 0;
      // The page is read again here: it may have been edited, or left, while the images
      // were being read. Saving is keyed by content, so running twice is harmless.
      setState((current) => {
        if (!current || current.notebook.id !== notebookId) return current;
        const files = { ...current.files, ...added };
        const at = current.pages.findIndex((page) => page.id === pageId);
        const target = current.pages[at]?.zine;
        if (cell === null || !target) return { ...current, files };
        const zine = placeImages(target, cell, ids);
        const fill = pageFill(zineFill(zine), current.pages[at].drawing.length > 0);
        contentFills.current.set(pageId, zineFill(zine));
        if (at === current.index) zineSaver.current?.onChange({ zine, fill });
        else savePageZine(db, pageId, zine, fill).catch(report);
        const pages = current.pages.map((page, i) => (i === at ? { ...page, zine, fill } : page));
        return { ...current, pages, files };
      });
      return ids.length;
    },
    [db, state],
  );

  const placeFile = useCallback(
    (cell: number, fileId: string) => {
      if (!state) return;
      const zine = state.pages[state.index].zine;
      if (!zine || !state.files[fileId]) return;
      setZine(placeImages(zine, cell, [fileId]));
    },
    [state, setZine],
  );

  const deleteImage = useCallback(
    async (fileId: string) => {
      if (!state) return;
      await Promise.all([
        zineSaver.current?.flush(),
        drawingSaver.current?.saver.flush(),
        canvasSaver.current?.flush(),
      ]);
      await deleteFile(db, state.notebook.id, fileId);
      setState((current) => {
        if (!current) return current;
        const files = { ...current.files };
        delete files[fileId];
        return { ...current, files };
      });
    },
    [db, state],
  );

  const updateSection = useCallback(
    async (sectionId: string, patch: Partial<Pick<Section, "name" | "color">>) => {
      if (!state) return;
      await updateSectionRecord(db, state.notebook.id, sectionId, patch);
      setState((current) =>
        current
          ? {
              ...current,
              notebook: {
                ...current.notebook,
                sections: current.notebook.sections.map((section) =>
                  section.id === sectionId ? { ...section, ...patch } : section,
                ),
              },
            }
          : current,
      );
    },
    [db, state],
  );

  // Editing sections by length changes which pages are whose; no page moves and the open
  // page stays. The store returns the sections as written.
  const withSections = useCallback(
    (sections: Section[]) =>
      setState((current) =>
        current ? { ...current, notebook: { ...current.notebook, sections } } : current,
      ),
    [],
  );

  const appendSheet = useCallback(
    async (sectionId: string) => {
      if (!state) return;
      withSections(await appendSheetRecord(db, state.notebook.id, sectionId));
    },
    [db, state, withSections],
  );

  const removeSheet = useCallback(
    async (sectionId: string) => {
      if (!state) return;
      withSections(await removeSheetRecord(db, state.notebook.id, sectionId));
    },
    [db, state, withSections],
  );

  const addSection = useCallback(
    async (input: { name: string; color: string }) => {
      if (!state) return;
      withSections(await addSectionAtEndRecord(db, state.notebook.id, input));
    },
    [db, state, withSections],
  );

  const removeCut = useCallback(
    async (sectionId: string) => {
      if (!state) return;
      await removeCutRecord(db, state.notebook.id, sectionId);
      setState((current) =>
        current
          ? {
              ...current,
              notebook: {
                ...current.notebook,
                sections: current.notebook.sections.filter((section) => section.id !== sectionId),
              },
            }
          : current,
      );
    },
    [db, state],
  );

  const openSection = useCallback(
    (sectionId: string) => {
      if (!state) return;
      const section = state.notebook.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const remembered = state.pages.findIndex((page) => page.id === section.lastPageId);
      goTo(remembered >= 0 ? remembered : section.start);
    },
    [state, goTo],
  );

  const growNotebook = useCallback(
    async (size: number) => {
      if (!state) return;
      await growNotebookRecord(db, state.notebook.id, size);
      const pages = await listPages(db, state.notebook.id);
      setState((current) =>
        current ? { ...current, notebook: { ...current.notebook, size }, pages } : current,
      );
    },
    [db, state],
  );

  // The store refuses a shrink over anything written; the pages that go are forgotten
  // by the drawing editor too, should one be leaving them.
  const shrinkNotebook = useCallback(
    async (size: number) => {
      if (!state) return;
      await flushAll();
      await shrinkNotebookRecord(db, state.notebook.id, size);
      for (const page of state.pages) if (page.position >= size) deletedPages.current.add(page.id);
      const [notebook, pages] = await Promise.all([
        getNotebook(db, state.notebook.id),
        listPages(db, state.notebook.id),
      ]);
      if (!notebook) return;
      setState((current) => {
        if (!current) return current;
        const index = Math.min(current.index, pages.length - 1);
        if (index !== current.index) attachPage(pages[index]);
        return { ...current, notebook, pages, index, restoreView: pages[index].canvasView };
      });
    },
    [db, state, flushAll, attachPage],
  );

  const clearPage = useCallback(async () => {
    if (!state) return;
    const page = state.pages[state.index];
    await Promise.all([
      pageSaver.current?.flush(),
      zineSaver.current?.flush(),
      drawingSaver.current?.saver.flush(),
    ]);
    const cleared = await clearPageRecord(db, page.id);
    contentFills.current.set(page.id, 0);
    attachPage(cleared);
    setState((current) =>
      current
        ? { ...current, pages: current.pages.map((p, i) => (i === current.index ? cleared : p)) }
        : current,
    );
  }, [db, state, attachPage]);

  const setPageMarks = useCallback(
    (patch: Partial<Pick<Page, "showPageNumber">>) => {
      if (!state) return;
      const page = state.pages[state.index];
      updatePage(db, page.id, patch).catch(report);
      setState((current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((p, i) => (i === current.index ? { ...p, ...patch } : p)),
            }
          : current,
      );
    },
    [db, state],
  );

  const setPageMargin = useCallback(
    async (requested: number) => {
      if (!state) return;
      const page = state.pages[state.index];
      const margin = clampMargin(requested);
      if (margin === page.margin) return;
      await updatePage(db, page.id, { margin });
      setState((current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((p, i) => (i === current.index ? { ...p, margin } : p)),
            }
          : current,
      );
      if (page.divider !== null) {
        const width = pageMm(state.notebook.pageSize, state.notebook.orientation).width;
        const divider = snapDivider(
          page.divider,
          width,
          margin,
          getTheme(state.notebook.themeId).lined,
        );
        if (divider !== page.divider) await setDivider(divider);
      }
    },
    [db, state, setDivider],
  );

  const saveThumbnail = useCallback(
    (dataURL: string) => {
      if (!state) return;
      const page = state.pages[state.index];
      saveThumbnailRecord(db, state.notebook.id, page.id, dataURL).catch(report);
      setState((current) =>
        current
          ? { ...current, thumbnails: { ...current.thumbnails, [page.id]: dataURL } }
          : current,
      );
    },
    [db, state],
  );

  // The open page's editor saves through its saver; an editor reporting its last state
  // for a page just left saves straight away, since the savers have moved on. Files the
  // drawing's new image elements use (pasted images) join the notebook's.
  const setDrawing = useCallback(
    (pageId: string, content: DrawingContent, loadId: number) => {
      if (loadId !== loads.current || deletedPages.current.has(pageId)) return;
      const live = content.elements.filter((element) => !element.isDeleted);
      setState((current) => {
        if (!current || current.loadId !== loadId) return current;
        const at = current.pages.findIndex((page) => page.id === pageId);
        if (at < 0) return current;
        const page = { ...current.pages[at], drawing: live };
        const fill = fillOf(page);
        if (drawingSaver.current?.pageId === pageId) {
          drawingSaver.current.saver.onChange({ content, fill });
        } else {
          savePageDrawing(db, pageId, content.elements, content.files, fill).catch(report);
        }
        const added: Record<string, BinaryFileData> = {};
        for (const id of referencedFileIds(live)) {
          if (!current.files[id] && content.files[id]) added[id] = content.files[id];
        }
        const changed = elementsKey(current.pages[at].drawing) !== elementsKey(live);
        if (!changed && Object.keys(added).length === 0) return current;
        return {
          ...current,
          pages: changed
            ? current.pages.map((p, i) => (i === at ? { ...page, fill } : p))
            : current.pages,
          files: Object.keys(added).length > 0 ? { ...current.files, ...added } : current.files,
        };
      });
    },
    [db, fillOf],
  );

  // An editor from a previous load can still fire (for instance on a resize) while it is
  // being replaced; its content must never reach the current notebook.
  const onCanvasChange = useCallback((content: CanvasContent, loadId: number) => {
    if (loadId !== loads.current) return;
    canvasSaver.current?.onChange(content);
    const ids = referencedFileIds(content.elements);
    setState((current) => {
      if (!current || current.loadId !== loadId) return current;
      if (ids.join() === current.canvasFileIds.join()) return current;
      return { ...current, canvasFileIds: ids };
    });
  }, []);

  const onCanvasViewChange = useCallback((view: CanvasView, loadId: number) => {
    if (loadId !== loads.current) return;
    latestView.current = view;
    viewSaver.current?.onChange(view);
  }, []);

  const onGridChange = useCallback(
    (enabled: boolean) => {
      if (state) setCanvasGrid(db, state.notebook.id, enabled).catch(report);
    },
    [db, state],
  );

  const openNotebook = useCallback(
    async (id: string) => {
      if (state && id === state.notebook.id) return;
      await detach();
      await load(id);
    },
    [state, detach, load],
  );

  const closeNotebook = useCallback(async () => {
    await detach();
    loads.current += 1;
    setState(null);
    setShelf(await listNotebooks(db));
  }, [db, detach]);

  const renameNotebook = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await renameNotebookRecord(db, id, trimmed);
      setShelf(await listNotebooks(db));
    },
    [db],
  );

  const deleteNotebook = useCallback(
    async (id: string) => {
      await deleteNotebookRecord(db, id);
      const list = await listNotebooks(db);
      if (list.length === 0) {
        setShelf(null);
        setFirstRun(true);
      } else {
        setShelf(list);
      }
    },
    [db],
  );

  const createNotebook = useCallback(
    async (name: string, cover?: Partial<Cover>, size?: number) => {
      await detach();
      const { notebook } = await createNotebookRecord(db, { name, cover, size });
      await load(notebook.id);
    },
    [db, detach, load],
  );

  const updateSettings = useCallback(
    async (
      settings: Partial<
        Pick<Notebook, "name" | "cover" | "themeId" | "pageSize" | "orientation" | "defaults">
      >,
    ) => {
      if (!state) return;
      await updateNotebookSettings(db, state.notebook.id, settings);
      const notebook = { ...state.notebook, ...settings };
      // The pages follow the notebook's margin: a divider the new margin pushes on moves
      // to the nearest step that still leaves room for the left column.
      const resnapped: { id: string; divider: number }[] = [];
      if (notebook.defaults.margin !== state.notebook.defaults.margin) {
        const width = pageMm(notebook.pageSize, notebook.orientation).width;
        const lined = getTheme(notebook.themeId).lined;
        for (const page of state.pages) {
          if (page.divider === null) continue;
          const divider = snapDivider(page.divider, width, notebook.defaults.margin, lined);
          if (divider !== page.divider) resnapped.push({ id: page.id, divider });
        }
        await pageSaver.current?.flush();
        for (const { id, divider } of resnapped) await setPageDivider(db, id, divider);
      }
      setState((current) => {
        if (!current) return current;
        const moved = new Map(resnapped.map(({ id, divider }) => [id, divider]));
        const pages =
          moved.size === 0
            ? current.pages
            : current.pages.map((page) => {
                const divider = moved.get(page.id);
                return divider === undefined
                  ? page
                  : { ...page, divider, columns: columnsForDivider(page.columns, divider) };
              });
        if (moved.has(pages[current.index].id)) {
          const open = pages[current.index];
          latestColumns.current = open.columns;
          pageSaver.current?.markClean({ columns: open.columns, fill: open.fill });
        }
        return {
          ...current,
          notebook: { ...current.notebook, ...settings },
          pages,
          notebooks: current.notebooks.map((n) =>
            n.id === current.notebook.id ? { ...n, name: notebook.name, cover: notebook.cover } : n,
          ),
        };
      });
    },
    [db, state],
  );

  const downloadBackup = useCallback(async () => {
    if (!state) return;
    await Promise.all([
      pageSaver.current?.flush(),
      zineSaver.current?.flush(),
      viewSaver.current?.flush(),
      drawingSaver.current?.saver.flush(),
      canvasSaver.current?.flush(),
    ]);
    const doc = await exportNotebook(db, state.notebook.id);
    if (!doc) return;
    if (Object.keys(doc.files).length > 0) {
      const bytes = new Uint8Array(packBackupZip(doc));
      downloadBlob(zipBackupFileName(doc), new Blob([bytes], { type: "application/zip" }));
    } else {
      downloadText(backupFileName(doc), serializeBackup(doc));
    }
  }, [db, state]);

  const pruneImages = useCallback(async () => {
    if (!state) return 0;
    await Promise.all([
      zineSaver.current?.flush(),
      drawingSaver.current?.saver.flush(),
      canvasSaver.current?.flush(),
    ]);
    const removed = await pruneFiles(db, state.notebook.id);
    if (removed > 0) {
      const files = await loadNotebookFiles(db, state.notebook.id);
      setState((current) => (current ? { ...current, files } : current));
    }
    return removed;
  }, [db, state]);

  const restoreBackup = useCallback(
    async (file: File) => {
      const doc = isZipBackup(file)
        ? unpackBackupZip(new Uint8Array(await file.arrayBuffer()))
        : parseBackup(await file.text());
      const current = state?.notebook ?? null;
      if (current) {
        if (
          !window.confirm(
            `Open this backup in place of the notebook "${current.name}"? "${current.name}" will only remain in a backup you have already downloaded.`,
          )
        ) {
          return;
        }
      } else {
        const existing = await getNotebook(db, doc.id);
        if (
          existing &&
          !window.confirm(
            `Replace the notebook "${existing.name}" with this backup? Its current pages and canvas will be overwritten.`,
          )
        ) {
          return;
        }
      }
      await detach();
      await importNotebook(db, doc, { replace: true });
      // The notebook that was open goes once the import is in, so a failed import
      // leaves it untouched; a same-id backup has already replaced it.
      if (current && current.id !== doc.id) await deleteNotebookRecord(db, current.id);
      await load(doc.id);
    },
    [db, state, detach, load],
  );

  if (!state) {
    if (firstRun) return { firstRun: true, createNotebook, restoreBackup };
    if (shelf) {
      return {
        shelf: true,
        notebooks: shelf,
        openNotebook,
        createNotebook,
        renameNotebook,
        deleteNotebook,
        restoreBackup,
      };
    }
    return null;
  }
  return {
    ...state,
    page: state.pages[state.index],
    goTo,
    clearPage,
    setColumns,
    setFill,
    setDivider,
    setZine,
    setKind,
    addImages,
    placeFile,
    deleteImage,
    updateSection,
    appendSheet,
    removeSheet,
    addSection,
    removeCut,
    openSection,
    growNotebook,
    shrinkNotebook,
    setPageMarks,
    setPageMargin,
    saveThumbnail,
    setDrawing,
    onCanvasChange,
    onCanvasViewChange,
    onGridChange,
    openNotebook,
    closeNotebook,
    createNotebook,
    updateSettings,
    downloadBackup,
    pruneImages,
    restoreBackup,
  };
}
