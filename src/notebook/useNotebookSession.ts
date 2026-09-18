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
import { canAddPage } from "./pageRules";
import {
  columnsForDivider,
  referencedFileIds,
  type Canvas,
  type CanvasView,
  type Column,
  type DrawingLayer,
  type Notebook,
  type Page,
  type PageKind,
  type Tag,
} from "../store/model";
import {
  addFile,
  addTag as addTagRecord,
  createNotebook as createNotebookRecord,
  createPage,
  deleteFile,
  deleteNotebook as deleteNotebookRecord,
  deletePage as deletePageRecord,
  deleteTag as deleteTagRecord,
  exportNotebook,
  getCanvas,
  getNotebook,
  importNotebook,
  listNotebooks,
  listPages,
  loadNotebookFiles,
  loadThumbnails,
  pruneFiles,
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
  touchNotebook,
  updateNotebookSettings,
  updatePage,
  updateTag as updateTagRecord,
  type NotebookSummary,
} from "../store/notebooks";
import type { Cover } from "./cover";
import { downloadBlob, downloadText } from "./files";
import { importImage } from "./images";

export interface NotebookSession {
  notebook: Notebook;
  /** Every notebook in storage, most recently opened first. Refreshed when one is opened. */
  notebooks: NotebookSummary[];
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
  /** Appends a page of the given kind (lined by default) and opens it. */
  newPage: (kind?: PageKind) => Promise<void>;
  /**
   * Deletes the open page and opens its neighbour: the previous page, else the next.
   * The only page of a notebook is replaced by a fresh lined page instead, so a notebook
   * never has zero pages. Images a zine page used stay in the notebook's files.
   */
  deletePage: () => Promise<void>;
  setColumns: (columns: Column[]) => void;
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
  /** Tags are defined on the notebook; a page carries one or none. */
  addTag: (input: { name: string; color: string }) => Promise<Tag>;
  updateTag: (tagId: string, patch: Partial<Pick<Tag, "name" | "color">>) => Promise<void>;
  /** Removes the tag and untags its pages. */
  deleteTag: (tagId: string) => Promise<void>;
  setPageTag: (tagId: string | null) => void;
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
  /** Where the open page's drawing paints in writing mode. */
  setDrawingLayer: (layer: DrawingLayer) => void;
  /** Canvas callbacks carry the loadId of the editor that sent them; stale editors are ignored (dormant, section 8). */
  onCanvasChange: (content: CanvasContent, loadId: number) => void;
  onCanvasViewChange: (view: CanvasView, loadId: number) => void;
  onGridChange: (enabled: boolean) => void;
  /** Saves everything pending, then opens another notebook at its remembered page. */
  openNotebook: (id: string) => Promise<void>;
  /** Saves everything pending and puts the notebook back on the shelf. */
  closeNotebook: () => Promise<void>;
  /** Creates a notebook with one empty page and opens it. */
  createNotebook: (name: string, cover?: Partial<Cover>) => Promise<void>;
  /** The name and cover, the theme, the page size and orientation of every page, and the defaults for new pages. */
  updateSettings: (
    settings: Pick<
      Notebook,
      "name" | "cover" | "themeId" | "pageSize" | "orientation" | "defaults"
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
  const pageSaver = useRef<Autosave<Column[]> | null>(null);
  const zineSaver = useRef<Autosave<Zine> | null>(null);
  const viewSaver = useRef<Autosave<CanvasView> | null>(null);
  /** The open page's drawing saver, with the page it belongs to. */
  const drawingSaver = useRef<{ pageId: string; saver: Autosave<DrawingContent> } | null>(null);
  const canvasSaver = useRef<Autosave<CanvasContent> | null>(null);
  /** Pages deleted this session: a drawing editor leaving one has nothing to save. */
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
      pageSaver.current = createAutosave<Column[]>({
        save: (columns) => savePageText(db, page.id, columns),
        key: columnsKey,
        onError: report,
      });
      pageSaver.current.markClean(page.columns);
      zineSaver.current = null;
      if (page.zine) {
        zineSaver.current = createAutosave<Zine>({
          save: (zine) => savePageZine(db, page.id, zine),
          key: (zine) => JSON.stringify(zine),
          onError: report,
        });
        zineSaver.current.markClean(page.zine);
      }
      viewSaver.current = createAutosave<CanvasView>({
        save: (view) => updatePage(db, page.id, { canvasView: view }),
        key: viewKey,
        delayMs: 800,
        onError: report,
      });
      if (page.canvasView) viewSaver.current.markClean(page.canvasView);
      latestView.current = page.canvasView;
      const saver = createAutosave<DrawingContent>({
        save: (content) => savePageDrawing(db, page.id, content.elements, content.files),
        key: (content) => elementsKey(content.elements),
        onError: report,
      });
      saver.markClean({ elements: page.drawing, files: {} });
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
      const [notebook, pages, canvas, files, thumbnails] = await Promise.all([
        getNotebook(db, notebookId),
        listPages(db, notebookId),
        getCanvas(db, notebookId),
        loadNotebookFiles(db, notebookId),
        loadThumbnails(db, notebookId),
      ]);
      if (!notebook) throw new Error(`Notebook ${notebookId} not found`);
      await touchNotebook(db, notebookId);
      const notebooks = await listNotebooks(db);
      const remembered = pages.findIndex((page) => page.id === notebook.lastPageId);
      const index = remembered >= 0 ? remembered : pages.length - 1;
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
        setLastPage(db, current.notebook.id, pages[index].id).catch(report);
        return { ...current, pages, index, restoreView: pages[index].canvasView };
      });
    },
    [db, attachPage],
  );

  // Refused while the open page is empty (the one-page rule), whichever control asked.
  const newPage = useCallback(
    async (kind: PageKind = "lined") => {
      if (!state || !canAddPage(state.pages[state.index])) return;
      const page = await createPage(db, state.notebook.id, {
        kind,
        divider: state.pages[state.index].divider,
      });
      setState((current) => {
        if (!current) return current;
        const pages = current.pages.map((p, i) =>
          i === current.index ? { ...p, canvasView: latestView.current } : p,
        );
        pages.push(page);
        attachPage(page);
        setLastPage(db, current.notebook.id, page.id).catch(report);
        return { ...current, pages, index: pages.length - 1, restoreView: null };
      });
    },
    [db, state, attachPage],
  );

  const deletePage = useCallback(async () => {
    if (!state) return;
    const page = state.pages[state.index];
    await Promise.all([
      pageSaver.current?.flush(),
      zineSaver.current?.flush(),
      viewSaver.current?.flush(),
      drawingSaver.current?.saver.flush(),
    ]);
    const opened = await deletePageRecord(db, page.id);
    deletedPages.current.add(page.id);
    setState((current) => {
      if (!current) return current;
      const pages = current.pages.filter((p) => p.id !== page.id);
      let index = pages.findIndex((p) => p.id === opened.id);
      if (index < 0) {
        // The only page was deleted: the store made a fresh one in its place.
        pages.push(opened);
        index = pages.length - 1;
      }
      const next = pages[index];
      attachPage(next);
      return { ...current, pages, index, restoreView: next.canvasView };
    });
  }, [db, state, attachPage]);

  const setColumns = useCallback((columns: Column[]) => {
    pageSaver.current?.onChange(columns);
    setState((current) => {
      if (!current) return current;
      const pages = current.pages.map((page, i) =>
        i === current.index ? { ...page, columns } : page,
      );
      return { ...current, pages };
    });
  }, []);

  const setDivider = useCallback(
    async (divider: number | null) => {
      if (!state) return;
      const page = state.pages[state.index];
      await pageSaver.current?.flush();
      await setPageDivider(db, page.id, divider);
      const columns = columnsForDivider(page.columns, divider);
      pageSaver.current?.markClean(columns);
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
    zineSaver.current?.onChange(zine);
    setState((current) => {
      if (!current) return current;
      const pages = current.pages.map((page, i) =>
        i === current.index ? { ...page, zine } : page,
      );
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
        if (at === current.index) zineSaver.current?.onChange(zine);
        else savePageZine(db, pageId, zine).catch(report);
        const pages = current.pages.map((page, i) => (i === at ? { ...page, zine } : page));
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

  const addTag = useCallback(
    async (input: { name: string; color: string }) => {
      if (!state) throw new Error("No notebook open");
      const tag = await addTagRecord(db, state.notebook.id, input);
      setState((current) =>
        current
          ? { ...current, notebook: { ...current.notebook, tags: [...current.notebook.tags, tag] } }
          : current,
      );
      return tag;
    },
    [db, state],
  );

  const updateTag = useCallback(
    async (tagId: string, patch: Partial<Pick<Tag, "name" | "color">>) => {
      if (!state) return;
      await updateTagRecord(db, state.notebook.id, tagId, patch);
      setState((current) =>
        current
          ? {
              ...current,
              notebook: {
                ...current.notebook,
                tags: current.notebook.tags.map((tag) =>
                  tag.id === tagId ? { ...tag, ...patch } : tag,
                ),
              },
            }
          : current,
      );
    },
    [db, state],
  );

  const deleteTag = useCallback(
    async (tagId: string) => {
      if (!state) return;
      await deleteTagRecord(db, state.notebook.id, tagId);
      setState((current) =>
        current
          ? {
              ...current,
              notebook: {
                ...current.notebook,
                tags: current.notebook.tags.filter((tag) => tag.id !== tagId),
              },
              pages: current.pages.map((page) =>
                page.tagId === tagId ? { ...page, tagId: null } : page,
              ),
            }
          : current,
      );
    },
    [db, state],
  );

  const setPageTag = useCallback(
    (tagId: string | null) => {
      if (!state) return;
      const page = state.pages[state.index];
      updatePage(db, page.id, { tagId }).catch(report);
      setState((current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((p, i) => (i === current.index ? { ...p, tagId } : p)),
            }
          : current,
      );
    },
    [db, state],
  );

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
      if (drawingSaver.current?.pageId === pageId) {
        drawingSaver.current.saver.onChange(content);
      } else {
        savePageDrawing(db, pageId, content.elements, content.files).catch(report);
      }
      const live = content.elements.filter((element) => !element.isDeleted);
      setState((current) => {
        if (!current || current.loadId !== loadId) return current;
        const at = current.pages.findIndex((page) => page.id === pageId);
        if (at < 0) return current;
        const added: Record<string, BinaryFileData> = {};
        for (const id of referencedFileIds(live)) {
          if (!current.files[id] && content.files[id]) added[id] = content.files[id];
        }
        const changed = elementsKey(current.pages[at].drawing) !== elementsKey(live);
        if (!changed && Object.keys(added).length === 0) return current;
        return {
          ...current,
          pages: changed
            ? current.pages.map((page, i) => (i === at ? { ...page, drawing: live } : page))
            : current.pages,
          files: Object.keys(added).length > 0 ? { ...current.files, ...added } : current.files,
        };
      });
    },
    [db],
  );

  const setDrawingLayer = useCallback(
    (drawingLayer: DrawingLayer) => {
      if (!state) return;
      const page = state.pages[state.index];
      if (page.drawingLayer === drawingLayer) return;
      updatePage(db, page.id, { drawingLayer }).catch(report);
      setState((current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((p, i) =>
                i === current.index ? { ...p, drawingLayer } : p,
              ),
            }
          : current,
      );
    },
    [db, state],
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
    async (name: string, cover?: Partial<Cover>) => {
      await detach();
      const { notebook } = await createNotebookRecord(db, { name, cover });
      await load(notebook.id);
    },
    [db, detach, load],
  );

  const updateSettings = useCallback(
    async (
      settings: Pick<
        Notebook,
        "name" | "cover" | "themeId" | "pageSize" | "orientation" | "defaults"
      >,
    ) => {
      if (!state) return;
      await updateNotebookSettings(db, state.notebook.id, settings);
      setState((current) =>
        current
          ? {
              ...current,
              notebook: { ...current.notebook, ...settings },
              notebooks: current.notebooks.map((n) =>
                n.id === current.notebook.id
                  ? { ...n, name: settings.name, cover: settings.cover }
                  : n,
              ),
            }
          : current,
      );
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
    newPage,
    deletePage,
    setColumns,
    setDivider,
    setZine,
    setKind,
    addImages,
    placeFile,
    deleteImage,
    addTag,
    updateTag,
    deleteTag,
    setPageTag,
    setPageMarks,
    setPageMargin,
    saveThumbnail,
    setDrawing,
    setDrawingLayer,
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
