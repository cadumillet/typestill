import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasContent } from "../canvas/Canvas";
import { createAutosave, columnsKey, elementsKey, type Autosave } from "../store/autosave";
import { backupFileName, parseBackup, serializeBackup } from "../store/backup";
import { getDb, type TypestillDb } from "../store/db";
import { placeImages, type Zine } from "../page/zine";
import {
  columnsForDivider,
  referencedFileIds,
  type Canvas,
  type CanvasView,
  type Column,
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
  deleteTag as deleteTagRecord,
  exportNotebook,
  getCanvas,
  getNotebook,
  importNotebook,
  listNotebooks,
  listPages,
  loadNotebookFiles,
  saveCanvasContent,
  savePageText,
  savePageZine,
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
import { downloadText } from "./files";
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
  /** The view the open page remembers. Changes only when a page is opened. */
  restoreView: CanvasView | null;
  /** Increments each time a notebook is loaded. Key the canvas editor by it so it starts over. */
  loadId: number;
  goTo: (index: number) => void;
  /** Appends a page of the given kind (lined by default) and opens it. */
  newPage: (kind?: PageKind) => Promise<void>;
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
  /** Canvas callbacks carry the loadId of the editor that sent them; stale editors are ignored. */
  onCanvasChange: (content: CanvasContent, loadId: number) => void;
  onCanvasViewChange: (view: CanvasView, loadId: number) => void;
  onGridChange: (enabled: boolean) => void;
  /** Saves everything pending, then opens another notebook at its remembered page. */
  openNotebook: (id: string) => Promise<void>;
  /** Creates a notebook with one empty page and opens it. */
  createNotebook: (name: string) => Promise<void>;
  /** The cover, the theme, and the page size and orientation applied to every page. */
  updateSettings: (
    settings: Pick<Notebook, "cover" | "themeId" | "pageSize" | "orientation">,
  ) => Promise<void>;
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
  notebooks: NotebookSummary[];
  pages: Page[];
  index: number;
  canvas: Canvas;
  files: Record<string, BinaryFileData>;
  canvasFileIds: string[];
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
  const pageSaver = useRef<Autosave<Column[]> | null>(null);
  const zineSaver = useRef<Autosave<Zine> | null>(null);
  const viewSaver = useRef<Autosave<CanvasView> | null>(null);
  const canvasSaver = useRef<Autosave<CanvasContent> | null>(null);
  /** Latest canvas view seen, written onto the page when it is left. */
  const latestView = useRef<CanvasView | null>(null);
  const loads = useRef(0);

  const flushAll = useCallback(() => {
    void pageSaver.current?.flush();
    void zineSaver.current?.flush();
    void viewSaver.current?.flush();
    void canvasSaver.current?.flush();
  }, []);

  /** Points the page savers at a page. Flushes whatever the previous page still had. */
  const attachPage = useCallback(
    (page: Page) => {
      void pageSaver.current?.flush();
      void zineSaver.current?.flush();
      void viewSaver.current?.flush();
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
    },
    [db],
  );

  /** Stops all saving. Used before the stored notebook changes under the session. */
  const detach = useCallback(async () => {
    await Promise.all([
      pageSaver.current?.flush(),
      zineSaver.current?.flush(),
      viewSaver.current?.flush(),
      canvasSaver.current?.flush(),
    ]);
    pageSaver.current = null;
    zineSaver.current = null;
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
      setState({
        loadId: loads.current,
        notebook,
        notebooks,
        pages,
        index,
        canvas,
        files,
        canvasFileIds: referencedFileIds(canvas.elements),
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
        list[0]?.id ?? (await createNotebookRecord(db, { name: "Notebook" })).notebook.id;
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

  const newPage = useCallback(
    async (kind: PageKind = "lined") => {
      if (!state) return;
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
      await Promise.all([zineSaver.current?.flush(), canvasSaver.current?.flush()]);
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
      if (!state || id === state.notebook.id) return;
      await detach();
      await load(id);
    },
    [state, detach, load],
  );

  const createNotebook = useCallback(
    async (name: string) => {
      await detach();
      const { notebook } = await createNotebookRecord(db, { name });
      await load(notebook.id);
    },
    [db, detach, load],
  );

  const updateSettings = useCallback(
    async (settings: Pick<Notebook, "cover" | "themeId" | "pageSize" | "orientation">) => {
      if (!state) return;
      await updateNotebookSettings(db, state.notebook.id, settings);
      setState((current) =>
        current
          ? {
              ...current,
              notebook: { ...current.notebook, ...settings },
              notebooks: current.notebooks.map((n) =>
                n.id === current.notebook.id ? { ...n, cover: settings.cover } : n,
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
    setZine,
    setKind,
    addImages,
    placeFile,
    deleteImage,
    addTag,
    updateTag,
    deleteTag,
    setPageTag,
    onCanvasChange,
    onCanvasViewChange,
    onGridChange,
    openNotebook,
    createNotebook,
    updateSettings,
    downloadBackup,
    restoreBackup,
  };
}
