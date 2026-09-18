import Dexie from "dexie";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { DEFAULT_COVER, type Cover } from "../notebook/cover";
import {
  DEFAULT_SECTION_NAME,
  cut,
  moveCut as moveCutOf,
  removeCut as removeCutOf,
  sectionRange,
  validateSections,
} from "../notebook/sections";
import type { Orientation, PageSize } from "../page/paper";
import { emptyZine, type Zine } from "../page/zine";
import { DEFAULT_THEME_ID, getTheme } from "../theme/themes";
import type { TypestillDb } from "./db";
import {
  DEFAULT_NOTEBOOK_DEFAULTS,
  DEFAULT_NOTEBOOK_SIZE,
  SHEET,
  blankPage,
  columnsForDivider,
  emptyColumns,
  isPageBlank,
  isPageEmpty,
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

// The emptiness predicates live with the stored shape, so the converter can share them.
export { isPageBlank, isPageEmpty } from "./model";

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
  /** Pages, a positive multiple of SHEET; DEFAULT_NOTEBOOK_SIZE unless given. */
  size?: number;
}

function isSheetCount(size: number): boolean {
  return Number.isInteger(size) && size > 0 && size % SHEET === 0;
}

function emptyCanvas(notebookId: string): Canvas {
  return { notebookId, gridEnabled: true, elements: [] };
}

/** Pages of a notebook in position order, via the [notebookId+position] index. */
function pagesOf(db: TypestillDb, notebookId: string) {
  return db.pages
    .where("[notebookId+position]")
    .between([notebookId, Dexie.minKey], [notebookId, Dexie.maxKey]);
}

/**
 * Blank lined pages for the slots `from` to `to` (exclusive), created after `after`:
 * createdAt stays strictly increasing over the notebook even when many pages are made
 * within the same millisecond.
 */
function blankPages(notebook: Notebook, from: number, to: number, after: number): Page[] {
  const start = Math.max(Date.now(), after + 1);
  const pages: Page[] = [];
  for (let position = from; position < to; position++) {
    pages.push(blankPage(notebook, position, start + position - from));
  }
  return pages;
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
 * Creates a notebook whole: one section, Notes, in the cover's colour, every one of its
 * `size` blank pages in position order (opened at the first) and an empty canvas, in one
 * transaction. Throws for a size that is not a positive multiple of SHEET.
 */
export async function createNotebook(
  db: TypestillDb,
  input: CreateNotebookInput,
): Promise<{ notebook: Notebook; firstPage: Page }> {
  const size = input.size ?? DEFAULT_NOTEBOOK_SIZE;
  if (!isSheetCount(size)) throw new Error(`A notebook has a multiple of ${SHEET} pages`);
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
    size,
    sections: [],
  };
  const notes: Section = {
    id: newId(),
    name: DEFAULT_SECTION_NAME,
    color: notebook.cover.color,
    start: 0,
    lastPageId: null,
  };
  notebook.sections = [notes];
  const pages = blankPages(notebook, 0, size, now - 1);
  const firstPage = pages[0];
  notebook.lastPageId = firstPage.id;
  await db.transaction("rw", [db.notebooks, db.pages, db.canvases], async () => {
    await db.notebooks.add(notebook);
    await db.pages.bulkAdd(pages);
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
// Sections: cuts at sheet boundaries, in start order; the first is at 0 and stays.

export class FirstSectionError extends Error {
  constructor(public readonly sectionId: string) {
    super("The first section cannot move or be removed");
    this.name = "FirstSectionError";
  }
}

async function notebookOf(db: TypestillDb, notebookId: string): Promise<Notebook> {
  const notebook = await db.notebooks.get(notebookId);
  if (!notebook) throw new Error(`Notebook ${notebookId} not found`);
  return notebook;
}

function sectionIndexIn(notebook: Notebook, sectionId: string): number {
  const index = notebook.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) throw new Error(`Section ${sectionId} not found`);
  return index;
}

/**
 * Cuts a new section at `start` (a multiple of SHEET, not 0, below the size and not
 * already a start) and returns it. The pages from there to the next cut are its.
 */
export async function cutSection(
  db: TypestillDb,
  notebookId: string,
  start: number,
  input: { name: string; color: string },
): Promise<Section> {
  return db.transaction("rw", db.notebooks, async () => {
    const notebook = await notebookOf(db, notebookId);
    const sections = cut(notebook.sections, start, input.name.trim(), input.color);
    validateSections(sections, notebook.size);
    await db.notebooks.update(notebookId, { sections });
    return sections.find((section) => section.start === start)!;
  });
}

/**
 * Moves a section's cut to `start`, between its neighbours' cuts; the pages between the
 * old and the new start change section, nothing else. Throws FirstSectionError for the
 * first section.
 */
export async function moveCut(
  db: TypestillDb,
  notebookId: string,
  sectionId: string,
  start: number,
): Promise<void> {
  await db.transaction("rw", db.notebooks, async () => {
    const notebook = await notebookOf(db, notebookId);
    const index = sectionIndexIn(notebook, sectionId);
    if (index === 0) throw new FirstSectionError(sectionId);
    const sections = moveCutOf(notebook.sections, index, start);
    validateSections(sections, notebook.size);
    await db.notebooks.update(notebookId, { sections });
  });
}

/**
 * Removes a section's cut: its pages merge into the section before it. Returns that
 * section and how many pages merged. Throws FirstSectionError for the first section,
 * which has nothing before it.
 */
export async function removeCut(
  db: TypestillDb,
  notebookId: string,
  sectionId: string,
): Promise<{ mergedInto: Section; count: number }> {
  return db.transaction("rw", db.notebooks, async () => {
    const notebook = await notebookOf(db, notebookId);
    const index = sectionIndexIn(notebook, sectionId);
    if (index === 0) throw new FirstSectionError(sectionId);
    const { start, end } = sectionRange(notebook.sections, notebook.size, index);
    const sections = removeCutOf(notebook.sections, index);
    await db.notebooks.update(notebookId, { sections });
    return { mergedInto: sections[index - 1], count: end - start };
  });
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

/** Records the page a section was left at, so its name in the grid returns there. */
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

// ---------------------------------------------------------------------------
// Size: whole sheets, grown freely and shrunk only over blank pages.

export class NotebookNotBlankError extends Error {
  constructor(public readonly pageNumber: number) {
    super(`Page ${pageNumber} has something on it`);
    this.name = "NotebookNotBlankError";
  }
}

export class SectionPastEndError extends Error {
  constructor(public readonly section: Section) {
    super(`The section ${section.name} starts at page ${section.start + 1}, past the end`);
    this.name = "SectionPastEndError";
  }
}

/**
 * Grows the notebook to `size` pages, a multiple of SHEET above the current size, by
 * appending blank lined pages to the last section, in one transaction.
 */
export async function growNotebook(
  db: TypestillDb,
  notebookId: string,
  size: number,
): Promise<void> {
  await db.transaction("rw", [db.notebooks, db.pages], async () => {
    const notebook = await notebookOf(db, notebookId);
    if (!isSheetCount(size) || size <= notebook.size) {
      throw new Error(`A notebook grows to a larger multiple of ${SHEET} pages, not ${size}`);
    }
    const last = await pagesOf(db, notebookId).last();
    await db.pages.bulkAdd(blankPages(notebook, notebook.size, size, last?.createdAt ?? 0));
    await db.notebooks.update(notebookId, { size });
  });
}

/**
 * Shrinks the notebook to `size` pages, a positive multiple of SHEET below the current
 * size, dropping the pages past it with their thumbnails, in one transaction. Refuses
 * with NotebookNotBlankError, naming the first page that has something on it, when any
 * page to drop is not blank, and with SectionPastEndError when a section would start
 * past the end. A remembered page that goes is replaced by the new last page for the
 * notebook and forgotten by a section.
 */
export async function shrinkNotebook(
  db: TypestillDb,
  notebookId: string,
  size: number,
): Promise<void> {
  await db.transaction("rw", [db.notebooks, db.pages, db.thumbnails], async () => {
    const notebook = await notebookOf(db, notebookId);
    if (!isSheetCount(size) || size >= notebook.size) {
      throw new Error(`A notebook shrinks to a smaller multiple of ${SHEET} pages, not ${size}`);
    }
    const dropped = await db.pages
      .where("[notebookId+position]")
      .between([notebookId, size], [notebookId, Dexie.maxKey])
      .toArray();
    const written = dropped.find((page) => !isPageBlank(page));
    if (written) throw new NotebookNotBlankError(written.position + 1);
    const past = notebook.sections.find((section) => section.start >= size);
    if (past) throw new SectionPastEndError(past);
    const ids = dropped.map((page) => page.id);
    await db.pages.bulkDelete(ids);
    await db.thumbnails.bulkDelete(ids);
    const gone = new Set(ids);
    const patch: Partial<Notebook> = { size };
    if (notebook.lastPageId !== null && gone.has(notebook.lastPageId)) {
      const last = await pagesOf(db, notebookId).last();
      patch.lastPageId = last?.id ?? null;
    }
    if (notebook.sections.some((section) => section.lastPageId && gone.has(section.lastPageId))) {
      patch.sections = notebook.sections.map((section) =>
        section.lastPageId && gone.has(section.lastPageId)
          ? { ...section, lastPageId: null }
          : section,
      );
    }
    await db.notebooks.update(notebookId, patch);
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
 * A notebook's pages in position order: the page order, every slot of the notebook, and
 * what everything walks (flipping, numbering, the grid, search, the PDF).
 */
export function listPages(db: TypestillDb, notebookId: string): Promise<Page[]> {
  return pagesOf(db, notebookId).toArray();
}

export function getPage(db: TypestillDb, id: string): Promise<Page | undefined> {
  return db.pages.get(id);
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
    const fresh = blankPage(notebook, page.position, page.createdAt, kind);
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

/**
 * Empties a page in place and returns it as stored: a lined page's columns, keeping the
 * divider and margin; a zine page's rows, keeping the padding; the drawing; the fill.
 * The slot stays. Images the page used stay in the notebook's files; the media pool
 * owns their deletion.
 */
export async function clearPage(db: TypestillDb, id: string): Promise<Page> {
  return db.transaction("rw", [db.notebooks, db.pages], async () => {
    const page = await db.pages.get(id);
    if (!page) throw new Error(`Page ${id} not found`);
    const next: Page = { ...page, drawing: [], fill: 0 };
    if (page.kind === "zine") {
      const notebook = await notebookOf(db, page.notebookId);
      next.zine = { ...emptyZine(getTheme(notebook.themeId).zine), ...page.zine, rows: [] };
    } else {
      next.columns = emptyColumns(page.divider);
    }
    await db.pages.put(next);
    return next;
  });
}

export async function updatePage(
  db: TypestillDb,
  id: string,
  patch: Partial<Pick<Page, "showPageNumber" | "margin" | "drawingLayer" | "canvasView" | "fill">>,
): Promise<void> {
  await db.pages.update(id, patch);
}

/** The fill alongside a save, when the page measured one. */
function withFill<T extends object>(
  patch: T,
  fill: number | undefined,
): T | (T & { fill: number }) {
  return fill === undefined ? patch : { ...patch, fill };
}

/** Saves the page's text, one column at a time, and its fill when measured. */
export async function savePageText(
  db: TypestillDb,
  id: string,
  columns: readonly Column[],
  fill?: number,
): Promise<void> {
  await db.pages.update(id, withFill({ columns: [...columns] }, fill));
}

/** Saves a zine page's media block and text, and its fill when measured. */
export async function savePageZine(
  db: TypestillDb,
  id: string,
  zine: Zine,
  fill?: number,
): Promise<void> {
  await db.pages.update(id, withFill({ zine }, fill));
}

/**
 * Saves the page's drawing, and its fill when measured. Deleted elements are dropped,
 * and any file an image element references is stored with the notebook so it survives
 * a reload, like the canvas's.
 */
export async function savePageDrawing(
  db: TypestillDb,
  id: string,
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
  fill?: number,
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
    await db.pages.update(id, withFill({ drawing: live }, fill));
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
