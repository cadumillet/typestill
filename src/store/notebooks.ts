import Dexie from "dexie";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { DEFAULT_COVER, type Cover } from "../notebook/cover";
import { isBlankDocument } from "../page/document";
import type { Orientation, PageSize } from "../page/paper";
import { emptyZine, isZineEmpty, type Zine } from "../page/zine";
import type { TypestillDb } from "./db";
import {
  DEFAULT_NOTEBOOK_DEFAULTS,
  columnsForDivider,
  emptyColumns,
  newId,
  pageFileIds,
  referencedFileIds,
  type Canvas,
  type Column,
  type Notebook,
  type NotebookDefaults,
  type NotebookDocument,
  type Page,
  type PageKind,
} from "./model";

export class NotebookExistsError extends Error {
  constructor(public readonly notebookId: string) {
    super(`A notebook with id ${notebookId} already exists`);
    this.name = "NotebookExistsError";
  }
}

export interface NotebookSummary {
  id: string;
  name: string;
  createdAt: number;
  lastOpenedAt: number;
  pageCount: number;
  cover: Cover;
}

export interface CreateNotebookInput {
  name: string;
  cover?: Partial<Cover>;
  pageSize?: PageSize;
  orientation?: Orientation;
  defaults?: Partial<NotebookDefaults>;
}

function buildPage(
  notebook: Notebook,
  createdAt: number,
  kind: PageKind,
  divider: number | null,
): Page {
  const page: Page = {
    id: newId(),
    notebookId: notebook.id,
    createdAt,
    kind,
    tagId: null,
    showDate: notebook.defaults.showDate,
    showPageNumber: notebook.defaults.showPageNumber,
    margin: notebook.defaults.margin,
    columns: kind === "lined" ? emptyColumns(divider) : [],
    divider: kind === "lined" ? divider : null,
    canvasView: null,
  };
  if (kind === "zine") page.zine = emptyZine();
  return page;
}

/** A page with nothing written or placed on it. Only such a page can change kind. */
export function isPageEmpty(page: Page): boolean {
  if (page.kind === "zine") return !page.zine || isZineEmpty(page.zine);
  return page.columns.every((column) => isBlankDocument(column.doc));
}

function emptyCanvas(notebookId: string): Canvas {
  return { notebookId, gridEnabled: true, elements: [] };
}

/** Pages of a notebook in notebook order, via the [notebookId+createdAt] index. */
function pagesOf(db: TypestillDb, notebookId: string) {
  return db.pages
    .where("[notebookId+createdAt]")
    .between([notebookId, Dexie.minKey], [notebookId, Dexie.maxKey]);
}

async function removeNotebookRecords(db: TypestillDb, id: string): Promise<void> {
  await db.pages.where("notebookId").equals(id).delete();
  await db.files.where("notebookId").equals(id).delete();
  await db.canvases.delete(id);
  await db.notebooks.delete(id);
}

// ---------------------------------------------------------------------------
// Notebooks

/** Creates a notebook with one empty page and an empty canvas. */
export async function createNotebook(
  db: TypestillDb,
  input: CreateNotebookInput,
): Promise<{ notebook: Notebook; firstPage: Page }> {
  const now = Date.now();
  const notebook: Notebook = {
    id: newId(),
    name: input.name,
    createdAt: now,
    lastOpenedAt: now,
    lastPageId: null,
    cover: { ...DEFAULT_COVER, ...input.cover },
    pageSize: input.pageSize ?? "A5",
    orientation: input.orientation ?? "portrait",
    defaults: { ...DEFAULT_NOTEBOOK_DEFAULTS, ...input.defaults },
    tags: [],
  };
  const firstPage = buildPage(notebook, now, "lined", notebook.defaults.divider);
  notebook.lastPageId = firstPage.id;
  await db.transaction("rw", [db.notebooks, db.pages, db.canvases], async () => {
    await db.notebooks.add(notebook);
    await db.pages.add(firstPage);
    await db.canvases.add(emptyCanvas(notebook.id));
  });
  return { notebook, firstPage };
}

/** Shelf listing, most recently opened first. */
export async function listNotebooks(db: TypestillDb): Promise<NotebookSummary[]> {
  const notebooks = await db.notebooks.orderBy("lastOpenedAt").reverse().toArray();
  const counts = await Promise.all(
    notebooks.map((n) => db.pages.where("notebookId").equals(n.id).count()),
  );
  return notebooks.map((n, i) => ({
    id: n.id,
    name: n.name,
    createdAt: n.createdAt,
    lastOpenedAt: n.lastOpenedAt,
    pageCount: counts[i],
    cover: n.cover,
  }));
}

export function getNotebook(db: TypestillDb, id: string): Promise<Notebook | undefined> {
  return db.notebooks.get(id);
}

/** Records that the notebook was opened now. */
export async function touchNotebook(db: TypestillDb, id: string): Promise<void> {
  await db.notebooks.update(id, { lastOpenedAt: Date.now() });
}

/** Records the page the notebook is showing, so it reopens there. */
export async function setLastPage(db: TypestillDb, id: string, pageId: string): Promise<void> {
  await db.notebooks.update(id, { lastPageId: pageId });
}

export async function renameNotebook(db: TypestillDb, id: string, name: string): Promise<void> {
  await db.notebooks.update(id, { name });
}

export async function updateNotebookSettings(
  db: TypestillDb,
  id: string,
  patch: Partial<Pick<Notebook, "cover" | "pageSize" | "orientation" | "defaults">>,
): Promise<void> {
  await db.notebooks.update(id, patch);
}

/** Deletes the notebook with its pages, canvas and files. */
export async function deleteNotebook(db: TypestillDb, id: string): Promise<void> {
  await db.transaction("rw", [db.notebooks, db.pages, db.canvases, db.files], () =>
    removeNotebookRecords(db, id),
  );
}

// ---------------------------------------------------------------------------
// Pages

export function listPages(db: TypestillDb, notebookId: string): Promise<Page[]> {
  return pagesOf(db, notebookId).toArray();
}

export function getPage(db: TypestillDb, id: string): Promise<Page | undefined> {
  return db.pages.get(id);
}

/**
 * Appends a page, lined unless a kind is given. Pages never reorder, so createdAt is the
 * order; it is kept strictly increasing even when two pages are created within the same
 * millisecond. The divider is inherited from the page the user was on when given, else
 * from the notebook defaults.
 */
export async function createPage(
  db: TypestillDb,
  notebookId: string,
  options: { kind?: PageKind; divider?: number | null } = {},
): Promise<Page> {
  return db.transaction("rw", [db.notebooks, db.pages], async () => {
    const notebook = await db.notebooks.get(notebookId);
    if (!notebook) throw new Error(`Notebook ${notebookId} not found`);
    const last = await pagesOf(db, notebookId).last();
    const createdAt = Math.max(Date.now(), (last?.createdAt ?? 0) + 1);
    const divider = options.divider === undefined ? notebook.defaults.divider : options.divider;
    const page = buildPage(notebook, createdAt, options.kind ?? "lined", divider);
    await db.pages.add(page);
    return page;
  });
}

/**
 * Changes an empty page's kind. Returns the page as stored. Throws if the page has
 * content, since a kind change would drop it.
 */
export async function setPageKind(db: TypestillDb, id: string, kind: PageKind): Promise<Page> {
  return db.transaction("rw", [db.notebooks, db.pages], async () => {
    const page = await db.pages.get(id);
    if (!page) throw new Error(`Page ${id} not found`);
    if (page.kind === kind) return page;
    if (!isPageEmpty(page)) throw new Error("Only an empty page can change kind");
    const notebook = await db.notebooks.get(page.notebookId);
    if (!notebook) throw new Error(`Notebook ${page.notebookId} not found`);
    const fresh = buildPage(notebook, page.createdAt, kind, notebook.defaults.divider);
    const next: Page = {
      ...page,
      kind,
      columns: fresh.columns,
      divider: fresh.divider,
    };
    if (fresh.zine) next.zine = fresh.zine;
    else delete next.zine;
    await db.pages.put(next);
    return next;
  });
}

export async function updatePage(
  db: TypestillDb,
  id: string,
  patch: Partial<Pick<Page, "tagId" | "showDate" | "showPageNumber" | "margin" | "canvasView">>,
): Promise<void> {
  await db.pages.update(id, patch);
}

/** Saves the page's text, one column at a time. */
export async function savePageText(
  db: TypestillDb,
  id: string,
  columns: readonly Column[],
): Promise<void> {
  await db.pages.update(id, { columns: [...columns] });
}

/** Saves a zine page's media block and text. */
export async function savePageZine(db: TypestillDb, id: string, zine: Zine): Promise<void> {
  await db.pages.update(id, { zine });
}

/**
 * Moves, adds or removes the divider. Adding one keeps the text in the left column;
 * removing one joins the right column's paragraphs after the left column's.
 */
export async function setPageDivider(
  db: TypestillDb,
  id: string,
  divider: number | null,
): Promise<void> {
  await db.transaction("rw", db.pages, async () => {
    const page = await db.pages.get(id);
    if (!page) throw new Error(`Page ${id} not found`);
    await db.pages.update(id, { divider, columns: columnsForDivider(page.columns, divider) });
  });
}

/** Deletes a page. */
export async function deletePage(db: TypestillDb, id: string): Promise<void> {
  await db.pages.delete(id);
}

// ---------------------------------------------------------------------------
// Canvas

export async function getCanvas(db: TypestillDb, notebookId: string): Promise<Canvas> {
  return (await db.canvases.get(notebookId)) ?? emptyCanvas(notebookId);
}

export async function setCanvasGrid(
  db: TypestillDb,
  notebookId: string,
  gridEnabled: boolean,
): Promise<void> {
  await db.canvases.update(notebookId, { gridEnabled });
}

/**
 * Saves the canvas drawing. Deleted elements are dropped, and any file an image element
 * references is stored with the notebook so it survives a reload.
 */
export async function saveCanvasContent(
  db: TypestillDb,
  notebookId: string,
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
): Promise<void> {
  const live = elements.filter((element) => !element.isDeleted);
  await db.transaction("rw", [db.canvases, db.files], async () => {
    const known = new Set(
      (await db.files.where("notebookId").equals(notebookId).primaryKeys()).map(([, id]) => id),
    );
    const missing = referencedFileIds(live)
      .filter((id) => !known.has(id) && files[id])
      .map((id) => ({ notebookId, id, data: files[id] }));
    const updated = await db.canvases.update(notebookId, { elements: live });
    if (updated === 0) await db.canvases.add({ ...emptyCanvas(notebookId), elements: live });
    if (missing.length > 0) await db.files.bulkAdd(missing);
  });
}

// ---------------------------------------------------------------------------
// Files

/** All files of a notebook, keyed by file id, in the shape Excalidraw expects. */
export async function loadNotebookFiles(
  db: TypestillDb,
  notebookId: string,
): Promise<Record<string, BinaryFileData>> {
  const files = await db.files.where("notebookId").equals(notebookId).toArray();
  return Object.fromEntries(files.map((file) => [file.id, file.data]));
}

/** Stores an image with the notebook. The same content (same id) is stored once. */
export async function addFile(
  db: TypestillDb,
  notebookId: string,
  data: BinaryFileData,
): Promise<void> {
  await db.files.put({ notebookId, id: data.id, data });
}

/** File ids in use anywhere in the notebook: on zine pages or on the canvas. */
export async function usedFileIds(db: TypestillDb, notebookId: string): Promise<Set<string>> {
  const [pages, canvas] = await Promise.all([listPages(db, notebookId), getCanvas(db, notebookId)]);
  return new Set([...pageFileIds(pages), ...referencedFileIds(canvas.elements)]);
}

/** Removes files neither the zine pages nor the canvas reference. Returns how many. */
export async function pruneFiles(db: TypestillDb, notebookId: string): Promise<number> {
  return db.transaction("rw", [db.pages, db.canvases, db.files], async () => {
    const used = await usedFileIds(db, notebookId);
    const keys = await db.files.where("notebookId").equals(notebookId).primaryKeys();
    const stale = keys.filter(([, id]) => !used.has(id));
    await db.files.bulkDelete(stale);
    return stale.length;
  });
}

// ---------------------------------------------------------------------------
// Whole-notebook documents (backup)

export async function exportNotebook(
  db: TypestillDb,
  id: string,
): Promise<NotebookDocument | undefined> {
  return db.transaction("r", [db.notebooks, db.pages, db.canvases, db.files], async () => {
    const notebook = await db.notebooks.get(id);
    if (!notebook) return undefined;
    const [pages, canvas, files] = await Promise.all([
      listPages(db, id),
      getCanvas(db, id),
      loadNotebookFiles(db, id),
    ]);
    return { ...notebook, pages, canvas, files };
  });
}

/**
 * Stores a notebook document. Throws NotebookExistsError if the id is taken, unless
 * `replace` is set, in which case the existing notebook is removed first.
 */
export async function importNotebook(
  db: TypestillDb,
  doc: NotebookDocument,
  options: { replace?: boolean } = {},
): Promise<Notebook> {
  const { pages, canvas, files, ...notebook } = doc;
  await db.transaction("rw", [db.notebooks, db.pages, db.canvases, db.files], async () => {
    if (await db.notebooks.get(notebook.id)) {
      if (!options.replace) throw new NotebookExistsError(notebook.id);
      await removeNotebookRecords(db, notebook.id);
    }
    await db.notebooks.add(notebook);
    await db.pages.bulkAdd(pages.map((page) => ({ ...page, notebookId: notebook.id })));
    await db.canvases.add({ ...canvas, notebookId: notebook.id });
    await db.files.bulkAdd(
      Object.values(files).map((data) => ({ notebookId: notebook.id, id: data.id, data })),
    );
  });
  return notebook;
}
