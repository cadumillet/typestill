import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasContent } from "../canvas/Canvas";
import { createAutosave, elementsKey, textKey, type Autosave } from "../store/autosave";
import { backupFileName, parseBackup, serializeBackup } from "../store/backup";
import { getDb, type TypestillDb } from "../store/db";
import {
  columnsForDivider,
  type Canvas,
  type CanvasView,
  type Notebook,
  type Page,
} from "../store/model";
import {
  createNotebook,
  createPage,
  exportNotebook,
  getCanvas,
  getNotebook,
  importNotebook,
  listNotebooks,
  listPages,
  loadNotebookFiles,
  saveCanvasContent,
  savePageText,
  setCanvasGrid,
  setLastPage,
  setPageDivider,
  touchNotebook,
  updateNotebookSettings,
  updatePage,
} from "../store/notebooks";
import { downloadText } from "./files";

export interface NotebookSession {
  notebook: Notebook;
  pages: Page[];
  index: number;
  page: Page;
  /** The canvas as loaded. The editor reads it once; later changes live in the editor. */
  canvas: Canvas;
  files: Record<string, BinaryFileData>;
  /** The view the open page remembers. Changes only when a page is opened. */
  restoreView: CanvasView | null;
  /** Increments each time a notebook is loaded. Key the canvas editor by it so it starts over. */
  loadId: number;
  goTo: (index: number) => void;
  newPage: () => Promise<void>;
  setColumns: (columns: string[]) => void;
  setDivider: (divider: number | null) => Promise<void>;
  /** Canvas callbacks carry the loadId of the editor that sent them; stale editors are ignored. */
  onCanvasChange: (content: CanvasContent, loadId: number) => void;
  onCanvasViewChange: (view: CanvasView, loadId: number) => void;
  onGridChange: (enabled: boolean) => void;
  /** Page size and orientation, applied to every page. */
  updateSettings: (settings: Pick<Notebook, "pageSize" | "orientation">) => Promise<void>;
  /** Saves everything pending, then offers the notebook as a backup file. */
  downloadBackup: () => Promise<void>;
  /**
   * Restores a backup file and opens that notebook. Asks before replacing a notebook that
   * already exists. Throws BackupError for files that are not valid backups.
   */
  restoreBackup: (file: File) => Promise<void>;
}

interface Loaded {
  loadId: number;
  notebook: Notebook;
  pages: Page[];
  index: number;
  canvas: Canvas;
  files: Record<string, BinaryFileData>;
  restoreView: CanvasView | null;
}

const viewKey = (view: CanvasView) => `${view.scrollX},${view.scrollY},${view.zoom}`;

const report = (error: unknown) => console.error("typestill: save failed", error);

/**
 * Opens the most recently used notebook (creating one on first launch) and keeps it
 * saved: page text and the canvas drawing are autosaved as they change, and the canvas
 * view is remembered per page. Returns null until the notebook has loaded.
 */
export function useNotebookSession(db: TypestillDb = getDb()): NotebookSession | null {
  const [state, setState] = useState<Loaded | null>(null);
  const pageSaver = useRef<Autosave<string[]> | null>(null);
  const viewSaver = useRef<Autosave<CanvasView> | null>(null);
  const canvasSaver = useRef<Autosave<CanvasContent> | null>(null);
  /** Latest canvas view seen, written onto the page when it is left. */
  const latestView = useRef<CanvasView | null>(null);
  const loads = useRef(0);

  const flushAll = useCallback(() => {
    void pageSaver.current?.flush();
    void viewSaver.current?.flush();
    void canvasSaver.current?.flush();
  }, []);

  /** Points the page savers at a page. Flushes whatever the previous page still had. */
  const attachPage = useCallback(
    (page: Page) => {
      void pageSaver.current?.flush();
      void viewSaver.current?.flush();
      pageSaver.current = createAutosave<string[]>({
        save: (columns) => savePageText(db, page.id, columns),
        key: textKey,
        onError: report,
      });
      pageSaver.current.markClean(page.columns);
      viewSaver.current = createAutosave<CanvasView>({
        save: (view) => updatePage(db, page.id, { canvasView: view }),
        key: viewKey,
        delayMs: 800,
        onError: report,
      });
      if (page.canvasView) viewSaver.current.markClean(page.canvasView);
      latestView.current = page.canvasView;
    },
    [db],
  );

  /** Stops all saving. Used before the stored notebook changes under the session. */
  const detach = useCallback(async () => {
    await Promise.all([
      pageSaver.current?.flush(),
      viewSaver.current?.flush(),
      canvasSaver.current?.flush(),
    ]);
    pageSaver.current = null;
    viewSaver.current = null;
    canvasSaver.current = null;
  }, []);

  /** Opens a notebook: loads it, points the savers at it, and shows its remembered page. */
  const load = useCallback(
    async (notebookId: string) => {
      const [notebook, pages, canvas, files] = await Promise.all([
        getNotebook(db, notebookId),
        listPages(db, notebookId),
        getCanvas(db, notebookId),
        loadNotebookFiles(db, notebookId),
      ]);
      if (!notebook) throw new Error(`Notebook ${notebookId} not found`);
      await touchNotebook(db, notebookId);
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
      setState({
        loadId: loads.current,
        notebook,
        pages,
        index,
        canvas,
        files,
        restoreView: pages[index].canvasView,
      });
    },
    [db, attachPage],
  );

  // Open the most recently used notebook, creating one on first launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listNotebooks(db);
      if (cancelled) return;
      const notebookId =
        list[0]?.id ?? (await createNotebook(db, { name: "Notebook" })).notebook.id;
      if (cancelled) return;
      await load(notebookId);
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

  const newPage = useCallback(async () => {
    if (!state) return;
    const page = await createPage(db, state.notebook.id, {
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
  }, [db, state, attachPage]);

  const setColumns = useCallback((columns: string[]) => {
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

  // An editor from a previous load can still fire (for instance on a resize) while it is
  // being replaced; its content must never reach the current notebook.
  const onCanvasChange = useCallback((content: CanvasContent, loadId: number) => {
    if (loadId !== loads.current) return;
    canvasSaver.current?.onChange(content);
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

  const updateSettings = useCallback(
    async (settings: Pick<Notebook, "pageSize" | "orientation">) => {
      if (!state) return;
      await updateNotebookSettings(db, state.notebook.id, settings);
      setState((current) =>
        current ? { ...current, notebook: { ...current.notebook, ...settings } } : current,
      );
    },
    [db, state],
  );

  const downloadBackup = useCallback(async () => {
    if (!state) return;
    await Promise.all([
      pageSaver.current?.flush(),
      viewSaver.current?.flush(),
      canvasSaver.current?.flush(),
    ]);
    const doc = await exportNotebook(db, state.notebook.id);
    if (doc) downloadText(backupFileName(doc), serializeBackup(doc));
  }, [db, state]);

  const restoreBackup = useCallback(
    async (file: File) => {
      const doc = parseBackup(await file.text());
      const existing = await getNotebook(db, doc.id);
      if (
        existing &&
        !window.confirm(
          `Replace the notebook "${existing.name}" with this backup? Its current pages and canvas will be overwritten.`,
        )
      ) {
        return;
      }
      await detach();
      await importNotebook(db, doc, { replace: true });
      await load(doc.id);
    },
    [db, detach, load],
  );

  if (!state) return null;
  return {
    ...state,
    page: state.pages[state.index],
    goTo,
    newPage,
    setColumns,
    setDivider,
    onCanvasChange,
    onCanvasViewChange,
    onGridChange,
    updateSettings,
    downloadBackup,
    restoreBackup,
  };
}
