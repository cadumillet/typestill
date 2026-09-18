import Dexie from "dexie";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { DEFAULT_COVER, type Cover } from "../notebook/cover";
import { DEFAULT_SECTION_NAME, pagesInOrder } from "../notebook/sections";
import { isBlankDocument } from "../page/document";
import type { Orientation, PageSize } from "../page/paper";
import { emptyZine, isZineEmpty, type Zine } from "../page/zine";
import { DEFAULT_THEME_ID, getTheme } from "../theme/themes";
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
  type Section,
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
  themeId?: string;
  pageSize?: PageSize;
  orientation?: Orientation;
  defaults?: Partial<NotebookDefaults>;
}

function buildPage(
  notebook: Notebook,
  createdAt: number,
  kind: PageKind,
  divider: number | null,
  sectionId: string,
): Page {
  const page: Page = {
    id: newId(),
    notebookId: notebook.id,
    createdAt,
    kind,
    sectionId,
    showPageNumber: notebook.defaults.showPageNumber,
    margin: notebook.defaults.margin,
    columns: kind === "lined" ? emptyColumns(divider) : [],
    divider: kind === "lined" ? divider : null,
    drawing: [],
    drawingLayer: "over",
    canvasView: null,
  };
  if (kind === "zine") page.zine = emptyZine(getTheme(notebook.themeId).zine);
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

/** Pages of a notebook in creation order, via the [notebookId+createdAt] index. */
function pagesOf(db: TypestillDb, notebookId: string) {
  return db.pages
    .where("[notebookId+createdAt]")
    .between([notebookId, Dexie.minKey], [notebookId, Dexie.maxKey]);
}

async function removeNotebookRecords(db: TypestillDb, id: string): Promise<void> {
  await db.pages.where("notebookId").equals(id).delete();
  await db.files.where("notebookId").equals(id).delete();
  await db.thumbnails.where("notebookId").equals(id).delete();
  await db.canvases.delete(id);
  await db.notebooks.delete(id);
}

// ---------------------------------------------------------------------------
// Notebooks

/**
 * Creates a notebook with one section, Notes, in the cover's colour, one empty page in it
 * and an empty canvas.
 */
export async function createNotebook(
  db: TypestillDb,
  input: CreateNotebookInput,
): Promise<{ notebook: Notebook; firstPage: Page }> {
  const now = Date.now();
  const themeId = input.themeId ?? DEFAULT_THEME_ID;
  const notebook: Notebook = {
    id: newId(),
    name: input.name,
    createdAt: now,
    lastOpenedAt: now,
    lastPageId: null,
    cover: { ...DEFAULT_COVER, ...input.cover },
    themeId,
    pageSize: input.pageSize ?? "A5",
    orientation: input.orientation ?? "portrait",
    defaults: {
      ...DEFAULT_NOTEBOOK_DEFAULTS,
      margin: getTheme(themeId).lined.defaultMarginMm,
      ...input.defaults,
    },
    sections: [],
  };
  const notes: Section = {
    id: newId(),
    name: DEFAULT_SECTION_NAME,
    color: notebook.cover.color,
    lastPageId: null,
  };
  notebook.sections = [notes];
  const firstPage = buildPage(notebook, now, "lined", notebook.defaults.divider, notes.id);
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
  patch: Partial<
    Pick<Notebook, "name" | "cover" | "themeId" | "pageSize" | "orientation" | "defaults">
  >,
): Promise<void> {
  await db.notebooks.update(id, patch);
}

// ---------------------------------------------------------------------------
// Sections: the notebook's divisions, in order; every page is in one.

export class LastSectionError extends Error {
  constructor(public readonly sectionId: string) {
    super("A notebook keeps at least one section");
    this.name = "LastSectionError";
  }
}

async function notebookOf(db: TypestillDb, notebookId: string): Promise<Notebook> {
  const notebook = await db.notebooks.get(notebookId);
  if (!notebook) throw new Error(`Notebook ${notebookId} not found`);
  return notebook;
}

/** Adds a section at the end and returns it. */
export async function addSection(
  db: TypestillDb,
  notebookId: string,
  input: { name: string; color: string },
): Promise<Section> {
  const section: Section = {
    id: newId(),
    name: input.name.trim(),
    color: input.color,
    lastPageId: null,
  };
  await db.transaction("rw", db.notebooks, async () => {
    const notebook = await notebookOf(db, notebookId);
    await db.notebooks.update(notebookId, { sections: [...notebook.sections, section] });
  });
  return section;
}

/** Renames or recolours a section. */
export async function updateSection(
  db: TypestillDb,
  notebookId: string,
  sectionId: string,
  patch: Partial<Pick<Section, "name" | "color">>,
): Promise<void> {
  await db.transaction("rw", db.notebooks, async () => {
    const notebook = await notebookOf(db, notebookId);
    const sections = notebook.sections.map((section) =>
      section.id === sectionId ? { ...section, ...patch } : section,
    );
    await db.notebooks.update(notebookId, { sections });
  });
}

/** Swaps a section with the one before it (-1) or after it (1). Nothing moves at the ends. */
export async function moveSection(
  db: TypestillDb,
  notebookId: string,
  sectionId: string,
  direction: -1 | 1,
): Promise<void> {
  await db.transaction("rw", db.notebooks, async () => {
    const notebook = await notebookOf(db, notebookId);
    const sections = [...notebook.sections];
    const index = sections.findIndex((section) => section.id === sectionId);
    const other = index + direction;
    if (index < 0 || other < 0 || other >= sections.length) return;
    [sections[index], sections[other]] = [sections[other], sections[index]];
    await db.notebooks.update(notebookId, { sections });
  });
}

/**
 * Removes a section, moving its pages to the section before it, or after it for the
 * first. Returns that section and how many pages moved. Throws LastSectionError for the
 * only section: a notebook keeps at least one.
 */
export async function deleteSection(
  db: TypestillDb,
  notebookId: string,
  sectionId: string,
): Promise<{ movedTo: Section; count: number }> {
  return db.transaction("rw", [db.notebooks, db.pages], async () => {
    const notebook = await notebookOf(db, notebookId);
    const index = notebook.sections.findIndex((section) => section.id === sectionId);
    if (index < 0) throw new Error(`Section ${sectionId} not found`);
    if (notebook.sections.length === 1) throw new LastSectionError(sectionId);
    const movedTo = notebook.sections[index > 0 ? index - 1 : 1];
    await db.notebooks.update(notebookId, {
      sections: notebook.sections.filter((section) => section.id !== sectionId),
    });
    const count = await db.pages
      .where("notebookId")
      .equals(notebookId)
      .and((page) => page.sectionId === sectionId)
      .modify({ sectionId: movedTo.id });
    return { movedTo, count };
  });
}

/** Records the page a section was left at, so its tab returns there. */
export async function setSectionLastPage(
  db: TypestillDb,
  notebookId: string,
  sectionId: string,
  pageId: string | null,
): Promise<void> {
  await db.transaction("rw", db.notebooks, async () => {
    const notebook = await notebookOf(db, notebookId);
    const sections = notebook.sections.map((section) =>
      section.id === sectionId ? { ...section, lastPageId: pageId } : section,
    );
    await db.notebooks.update(notebookId, { sections });
  });
}

/** Deletes the notebook with its pages, canvas, files and thumbnails. */
export async function deleteNotebook(db: TypestillDb, id: string): Promise<void> {
  await db.transaction("rw", [db.notebooks, db.pages, db.canvases, db.files, db.thumbnails], () =>
    removeNotebookRecords(db, id),
  );
}

// ---------------------------------------------------------------------------
// Pages

/**
 * A notebook's pages in creation order. Notebook order puts the sections first: callers
 * that walk pages sort with pagesInOrder (src/notebook/sections.ts).
 */
export function listPages(db: TypestillDb, notebookId: string): Promise<Page[]> {
  return pagesOf(db, notebookId).toArray();
}

export function getPage(db: TypestillDb, id: string): Promise<Page | undefined> {
  return db.pages.get(id);
}

/**
 * Adds a page, lined unless a kind is given, at the end of the given section (which must
 * exist), else of the notebook's first section. Pages never reorder by hand, so createdAt
 * is the order within a section; it is kept strictly increasing over the whole notebook
 * even when two pages are created within the same millisecond. The divider is inherited
 * from the page the user was on when given, else from the notebook defaults.
 */
export async function createPage(
  db: TypestillDb,
  notebookId: string,
  options: { kind?: PageKind; divider?: number | null; sectionId?: string } = {},
): Promise<Page> {
  return db.transaction("rw", [db.notebooks, db.pages], async () => {
    const notebook = await db.notebooks.get(notebookId);
    if (!notebook) throw new Error(`Notebook ${notebookId} not found`);
    const sectionId = options.sectionId ?? notebook.sections[0].id;
    if (!notebook.sections.some((section) => section.id === sectionId)) {
      throw new Error(`Section ${sectionId} not found`);
    }
    const last = await pagesOf(db, notebookId).last();
    const createdAt = Math.max(Date.now(), (last?.createdAt ?? 0) + 1);
    const divider = options.divider === undefined ? notebook.defaults.divider : options.divider;
    const page = buildPage(notebook, createdAt, options.kind ?? "lined", divider, sectionId);
    await db.pages.add(page);
    return page;
  });
}

/**
 * Changes an empty page's kind. Returns the page as stored. Throws if the page has
 * content, since a kind change would drop it. The page's drawing is not content of
 * either kind, so it stays, as do the settings.
 */
export async function setPageKind(db: TypestillDb, id: string, kind: PageKind): Promise<Page> {
  return db.transaction("rw", [db.notebooks, db.pages], async () => {
    const page = await db.pages.get(id);
    if (!page) throw new Error(`Page ${id} not found`);
    if (page.kind === kind) return page;
    if (!isPageEmpty(page)) throw new Error("Only an empty page can change kind");
    const notebook = await db.notebooks.get(page.notebookId);
    if (!notebook) throw new Error(`Notebook ${page.notebookId} not found`);
    const fresh = buildPage(
      notebook,
      page.createdAt,
      kind,
      notebook.defaults.divider,
      page.sectionId,
    );
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
  patch: Partial<
    Pick<Page, "sectionId" | "showPageNumber" | "margin" | "drawingLayer" | "canvasView">
  >,
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
 * Saves the page's drawing. Deleted elements are dropped, and any file an image element
 * references is stored with the notebook so it survives a reload, like the canvas's.
 */
export async function savePageDrawing(
  db: TypestillDb,
  id: string,
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
): Promise<void> {
  const live = elements.filter((element) => !element.isDeleted);
  await db.transaction("rw", [db.pages, db.files], async () => {
    const page = await db.pages.get(id);
    if (!page) throw new Error(`Page ${id} not found`);
    const { notebookId } = page;
    const known = new Set(
      (await db.files.where("notebookId").equals(notebookId).primaryKeys()).map(
        ([, fileId]) => fileId,
      ),
    );
    const missing = referencedFileIds(live)
      .filter((fileId) => !known.has(fileId) && files[fileId])
      .map((fileId) => ({ notebookId, id: fileId, data: files[fileId] }));
    await db.pages.update(id, { drawing: live });
    if (missing.length > 0) await db.files.bulkAdd(missing);
  });
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

/**
 * The page to open once the page at `index` of `count` is gone: the previous one if there
 * is one, else the next. Null when it is the only page. The index is into the list before
 * the deletion.
 */
export function neighbourIndex(index: number, count: number): number | null {
  if (index > 0) return index - 1;
  return count > 1 ? 1 : null;
}

/**
 * Deletes a page and its thumbnail, and returns the page to open next: the previous page
 * in notebook order, else the next. A notebook keeps at least one page, so deleting the
 * only page replaces it with a fresh lined page built from the notebook defaults, in the
 * same section, which is then returned. If the deleted page was the notebook's remembered
 * page, the returned page takes its place; a section that remembered it forgets it.
 * Images a zine page used stay in the notebook's files; the media pool owns their
 * deletion.
 */
export async function deletePage(db: TypestillDb, id: string): Promise<Page> {
  return db.transaction("rw", [db.notebooks, db.pages, db.thumbnails], async () => {
    const page = await db.pages.get(id);
    if (!page) throw new Error(`Page ${id} not found`);
    const notebook = await db.notebooks.get(page.notebookId);
    if (!notebook) throw new Error(`Notebook ${page.notebookId} not found`);
    const pages = pagesInOrder(notebook.sections, await listPages(db, page.notebookId));
    const index = pages.findIndex((p) => p.id === id);
    const neighbour = neighbourIndex(index, pages.length);
    await db.pages.delete(id);
    await db.thumbnails.delete(id);
    let opened: Page;
    if (neighbour === null) {
      opened = buildPage(
        notebook,
        Math.max(Date.now(), page.createdAt + 1),
        "lined",
        notebook.defaults.divider,
        page.sectionId,
      );
      await db.pages.add(opened);
    } else {
      opened = pages[neighbour];
    }
    const patch: Partial<Notebook> = {};
    if (notebook.lastPageId === id) patch.lastPageId = opened.id;
    if (notebook.sections.some((section) => section.lastPageId === id)) {
      patch.sections = notebook.sections.map((section) =>
        section.lastPageId === id ? { ...section, lastPageId: null } : section,
      );
    }
    if (Object.keys(patch).length > 0) await db.notebooks.update(notebook.id, patch);
    return opened;
  });
}

// ---------------------------------------------------------------------------
// Thumbnails: a cache of rendered pages, keyed by page id, outside the backup.

export async function saveThumbnail(
  db: TypestillDb,
  notebookId: string,
  pageId: string,
  dataURL: string,
): Promise<void> {
  await db.thumbnails.put({ pageId, notebookId, dataURL, updatedAt: Date.now() });
}

/** Every thumbnail of a notebook, keyed by page id. */
export async function loadThumbnails(
  db: TypestillDb,
  notebookId: string,
): Promise<Record<string, string>> {
  const rows = await db.thumbnails.where("notebookId").equals(notebookId).toArray();
  return Object.fromEntries(rows.map((row) => [row.pageId, row.dataURL]));
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

export class FileInUseError extends Error {
  constructor(public readonly fileId: string) {
    super("The image is in use and cannot be deleted");
    this.name = "FileInUseError";
  }
}

/**
 * Deletes an image the notebook no longer uses anywhere: on zine pages, in page drawings
 * or on the canvas. Throws FileInUseError otherwise.
 */
export async function deleteFile(db: TypestillDb, notebookId: string, id: string): Promise<void> {
  await db.transaction("rw", [db.pages, db.canvases, db.files], async () => {
    if ((await usedFileIds(db, notebookId)).has(id)) throw new FileInUseError(id);
    await db.files.delete([notebookId, id]);
  });
}

/** File ids in use anywhere in the notebook: on zine pages, in page drawings or on the canvas. */
export async function usedFileIds(db: TypestillDb, notebookId: string): Promise<Set<string>> {
  const [pages, canvas] = await Promise.all([listPages(db, notebookId), getCanvas(db, notebookId)]);
  return new Set([...pageFileIds(pages), ...referencedFileIds(canvas.elements)]);
}

/** Removes files no zine page, page drawing or the canvas references. Returns how many. */
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
  await db.transaction(
    "rw",
    [db.notebooks, db.pages, db.canvases, db.files, db.thumbnails],
    async () => {
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
    },
  );
  return notebook;
}
