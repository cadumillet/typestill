import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasContent } from "../canvas/Canvas";
import { createAutosave, elementsKey, textKey, type Autosave } from "../store/autosave";
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
  getCanvas,
  getNotebook,
  listNotebooks,
  listPages,
  loadNotebookFiles,
  saveCanvasContent,
  savePageText,
  setCanvasGrid,
  setLastPage,
  setPageDivider,
  touchNotebook,
  updatePage,
} from "../store/notebooks";

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
  goTo: (index: number) => void;
  newPage: () => Promise<void>;
  setColumns: (columns: string[]) => void;
  setDivider: (divider: number | null) => Promise<void>;
  onCanvasChange: (content: CanvasContent) => void;
  onCanvasViewChange: (view: CanvasView) => void;
  onGridChange: (enabled: boolean) => void;
}

interface Loaded {
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

  // Load the notebook.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listNotebooks(db);
      if (cancelled) return;
      const notebookId =
        list[0]?.id ?? (await createNotebook(db, { name: "Notebook" })).notebook.id;
      const [notebook, pages, canvas, files] = await Promise.all([
        getNotebook(db, notebookId),
        listPages(db, notebookId),
        getCanvas(db, notebookId),
        loadNotebookFiles(db, notebookId),
      ]);
      if (cancelled || !notebook) return;
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
      setState({ notebook, pages, index, canvas, files, restoreView: pages[index].canvasView });
    })().catch(report);
    return () => {
      cancelled = true;
    };
  }, [db, attachPage]);

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

  const onCanvasChange = useCallback((content: CanvasContent) => {
    canvasSaver.current?.onChange(content);
  }, []);

  const onCanvasViewChange = useCallback((view: CanvasView) => {
    latestView.current = view;
    viewSaver.current?.onChange(view);
  }, []);

  const onGridChange = useCallback(
    (enabled: boolean) => {
      if (state) setCanvasGrid(db, state.notebook.id, enabled).catch(report);
    },
    [db, state],
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
  };
}
