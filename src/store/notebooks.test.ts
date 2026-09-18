import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_COVER } from "../notebook/cover";
import { columnFromText, documentFromText } from "../page/document";
import { TypestillDb } from "./db";
import { element, fileData, imageElement } from "./fixtures";
import { emptyZine, type Zine } from "../page/zine";
import {
  FileInUseError,
  NotebookExistsError,
  addFile,
  addTag,
  createNotebook,
  deleteFile,
  createPage,
  deleteNotebook,
  deletePage,
  deleteTag,
  exportNotebook,
  getCanvas,
  importNotebook,
  listNotebooks,
  listPages,
  loadNotebookFiles,
  loadThumbnails,
  isPageEmpty,
  neighbourIndex,
  pruneFiles,
  saveCanvasContent,
  savePageText,
  savePageZine,
  saveThumbnail,
  setCanvasGrid,
  setLastPage,
  setPageDivider,
  setPageKind,
  touchNotebook,
  updateNotebookSettings,
  updatePage,
  updateTag,
  usedFileIds,
} from "./notebooks";

let db: TypestillDb;

beforeEach(() => {
  db = new TypestillDb(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

describe("notebooks", () => {
  it("creates a notebook with one empty page and an empty canvas", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "Field notes" });
    expect(notebook.pageSize).toBe("A5");
    expect(notebook.orientation).toBe("portrait");
    expect(notebook.cover).toEqual(DEFAULT_COVER);
    expect(notebook.themeId).toBe("ruled");
    expect(firstPage.notebookId).toBe(notebook.id);
    expect(firstPage.kind).toBe("lined");
    expect(firstPage.columns).toEqual([columnFromText("")]);
    expect(firstPage.divider).toBeNull();
    expect(firstPage.margin).toBe(20);
    expect(firstPage.canvasView).toBeNull();
    expect(notebook.lastPageId).toBe(firstPage.id);
    expect((await db.notebooks.get(notebook.id))?.lastPageId).toBe(firstPage.id);
    expect(await listPages(db, notebook.id)).toHaveLength(1);
    expect(await getCanvas(db, notebook.id)).toEqual({
      notebookId: notebook.id,
      gridEnabled: true,
      elements: [],
    });
  });

  it("lists notebooks most recently opened first with page counts", async () => {
    const a = await createNotebook(db, { name: "A" });
    const b = await createNotebook(db, { name: "B" });
    await createPage(db, a.notebook.id);
    await touchNotebook(db, a.notebook.id);
    const list = await listNotebooks(db);
    expect(list.map((n) => n.name)).toEqual(["A", "B"]);
    expect(list[0].pageCount).toBe(2);
    expect(list[1].pageCount).toBe(1);
    expect(list[0].cover).toEqual(DEFAULT_COVER);
    expect(list[0].lastOpenedAt).toBeGreaterThanOrEqual(b.notebook.lastOpenedAt);
  });

  it("remembers the last page shown", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    const second = await createPage(db, notebook.id);
    await setLastPage(db, notebook.id, second.id);
    expect((await db.notebooks.get(notebook.id))?.lastPageId).toBe(second.id);
  });

  it("updates settings", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    await updateNotebookSettings(db, notebook.id, { pageSize: "A4", orientation: "landscape" });
    const stored = await db.notebooks.get(notebook.id);
    expect(stored?.pageSize).toBe("A4");
    expect(stored?.orientation).toBe("landscape");
  });

  it("references a theme and can change it", async () => {
    const { notebook } = await createNotebook(db, { name: "A", themeId: "plain" });
    expect(notebook.themeId).toBe("plain");
    await updateNotebookSettings(db, notebook.id, { themeId: "ruled" });
    expect((await db.notebooks.get(notebook.id))?.themeId).toBe("ruled");
  });

  it("gives notebooks from version 4 of the database the Ruled theme", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(4).stores({
      notebooks: "id, lastOpenedAt",
      pages: "id, notebookId, [notebookId+createdAt]",
      canvases: "notebookId",
      files: "[notebookId+id], notebookId",
    });
    await old.table("notebooks").add({ id: "nb", name: "Old", createdAt: 1, lastOpenedAt: 1 });
    old.close();
    const upgraded = new TypestillDb(name);
    try {
      expect((await upgraded.notebooks.get("nb"))?.themeId).toBe("ruled");
    } finally {
      await upgraded.delete();
    }
  });

  it("creates with a cover and updates it", async () => {
    const { notebook } = await createNotebook(db, { name: "A", cover: { emoji: "🌿" } });
    expect(notebook.cover).toEqual({ ...DEFAULT_COVER, emoji: "🌿" });
    const cover = { color: "#b8342c", emoji: null, subtitle: "Spring" };
    await updateNotebookSettings(db, notebook.id, { cover });
    expect((await db.notebooks.get(notebook.id))?.cover).toEqual(cover);
    expect((await listNotebooks(db))[0].cover).toEqual(cover);
  });

  it("gives notebooks from version 2 of the database the default cover", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(2).stores({
      notebooks: "id, lastOpenedAt",
      pages: "id, notebookId, [notebookId+createdAt]",
      canvases: "notebookId",
      files: "[notebookId+id], notebookId",
    });
    await old.table("notebooks").add({ id: "nb", name: "Old", createdAt: 1, lastOpenedAt: 1 });
    old.close();
    const upgraded = new TypestillDb(name);
    try {
      expect((await upgraded.notebooks.get("nb"))?.cover).toEqual(DEFAULT_COVER);
    } finally {
      await upgraded.delete();
    }
  });

  it("deletes a notebook with its pages, canvas and files", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    const other = await createNotebook(db, { name: "B" });
    await saveCanvasContent(db, notebook.id, [imageElement("img", "f1")], { f1: fileData("f1") });
    await deleteNotebook(db, notebook.id);
    expect(await db.notebooks.count()).toBe(1);
    expect(await db.pages.count()).toBe(1);
    expect(await db.canvases.count()).toBe(1);
    expect(await db.files.count()).toBe(0);
    expect(await listPages(db, other.notebook.id)).toHaveLength(1);
  });
});

describe("pages", () => {
  it("appends pages in strictly increasing order, even within one millisecond", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    const created = [];
    for (let i = 0; i < 5; i++) created.push(await createPage(db, notebook.id));
    const pages = await listPages(db, notebook.id);
    expect(pages.map((p) => p.id)).toEqual([pages[0].id, ...created.map((p) => p.id)]);
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i].createdAt).toBeGreaterThan(pages[i - 1].createdAt);
    }
  });

  it("inherits the divider from the defaults unless one is given", async () => {
    const { notebook } = await createNotebook(db, { name: "A", defaults: { divider: 70 } });
    const a = await createPage(db, notebook.id);
    expect(a.divider).toBe(70);
    expect(a.columns).toEqual([columnFromText(""), columnFromText("")]);
    const b = await createPage(db, notebook.id, { divider: null });
    expect(b.divider).toBeNull();
    expect(b.columns).toEqual([columnFromText("")]);
  });

  it("saves text, updates settings and deletes pages", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const second = await createPage(db, notebook.id);
    await savePageText(db, second.id, [columnFromText("hello")]);
    await updatePage(db, second.id, {
      showPageNumber: false,
      canvasView: { scrollX: 1, scrollY: 2, zoom: 0.5 },
    });
    const stored = await db.pages.get(second.id);
    expect(stored?.columns).toEqual([columnFromText("hello")]);
    expect(stored?.showPageNumber).toBe(false);
    expect(stored?.canvasView).toEqual({ scrollX: 1, scrollY: 2, zoom: 0.5 });
    expect((await deletePage(db, firstPage.id)).id).toBe(second.id);
    expect((await listPages(db, notebook.id)).map((p) => p.id)).toEqual([second.id]);
  });

  it("picks the previous page as the neighbour, else the next", () => {
    expect(neighbourIndex(0, 1)).toBeNull();
    expect(neighbourIndex(0, 2)).toBe(1);
    expect(neighbourIndex(1, 2)).toBe(0);
    expect(neighbourIndex(2, 5)).toBe(1);
    expect(neighbourIndex(4, 5)).toBe(3);
  });

  it("opens the neighbour after a deletion and keeps the remembered page valid", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const second = await createPage(db, notebook.id);
    const third = await createPage(db, notebook.id);
    // The first page has no previous page, so the next one opens.
    await setLastPage(db, notebook.id, firstPage.id);
    expect((await deletePage(db, firstPage.id)).id).toBe(second.id);
    expect((await db.notebooks.get(notebook.id))?.lastPageId).toBe(second.id);
    // Deleting a page other than the remembered one leaves the memory alone.
    expect((await deletePage(db, third.id)).id).toBe(second.id);
    expect((await db.notebooks.get(notebook.id))?.lastPageId).toBe(second.id);
    expect((await listPages(db, notebook.id)).map((p) => p.id)).toEqual([second.id]);
  });

  it("replaces the only page with a fresh lined page from the defaults", async () => {
    const { notebook, firstPage } = await createNotebook(db, {
      name: "A",
      defaults: { divider: 70 },
    });
    const zine = await setPageKind(db, firstPage.id, "zine");
    await savePageZine(db, zine.id, {
      ...emptyZine(),
      rows: [{ blocks: [{ kind: "image", image: { fileId: "f1", fit: "cover" } }] }],
    });
    await addFile(db, notebook.id, fileData("f1"));
    await updatePage(db, zine.id, { showPageNumber: false, margin: 30 });
    const fresh = await deletePage(db, zine.id);
    expect(fresh.id).not.toBe(zine.id);
    expect(fresh.kind).toBe("lined");
    expect(fresh.divider).toBe(70);
    expect(fresh.columns).toEqual([columnFromText(""), columnFromText("")]);
    expect(fresh.showPageNumber).toBe(notebook.defaults.showPageNumber);
    expect(fresh.margin).toBe(notebook.defaults.margin);
    expect(fresh.createdAt).toBeGreaterThan(zine.createdAt);
    expect((await listPages(db, notebook.id)).map((p) => p.id)).toEqual([fresh.id]);
    expect((await db.notebooks.get(notebook.id))?.lastPageId).toBe(fresh.id);
    // The image stays in the pool; deleting it is the pool's business.
    expect(Object.keys(await loadNotebookFiles(db, notebook.id))).toEqual(["f1"]);
  });

  it("refuses to delete a page that does not exist", async () => {
    await createNotebook(db, { name: "A" });
    await expect(deletePage(db, "missing")).rejects.toThrow(/not found/);
  });

  it("adds, moves and removes the divider without losing text", async () => {
    const { firstPage } = await createNotebook(db, { name: "A" });
    const left = columnFromText("left");
    const right = columnFromText("right");
    await savePageText(db, firstPage.id, [left]);
    await setPageDivider(db, firstPage.id, 70);
    expect((await db.pages.get(firstPage.id))?.columns).toEqual([left, columnFromText("")]);
    await savePageText(db, firstPage.id, [left, right]);
    await setPageDivider(db, firstPage.id, 80);
    expect((await db.pages.get(firstPage.id))?.divider).toBe(80);
    expect((await db.pages.get(firstPage.id))?.columns).toEqual([left, right]);
    await setPageDivider(db, firstPage.id, null);
    expect((await db.pages.get(firstPage.id))?.columns).toEqual([columnFromText("left\nright")]);
  });

  it("creates zine pages with no rows and no columns", async () => {
    const { notebook } = await createNotebook(db, { name: "A", defaults: { divider: 70 } });
    const page = await createPage(db, notebook.id, { kind: "zine" });
    expect(page.kind).toBe("zine");
    expect(page.columns).toEqual([]);
    expect(page.divider).toBeNull();
    expect(page.zine).toEqual(emptyZine());
    expect(isPageEmpty(page)).toBe(true);
    const zine: Zine = {
      ...emptyZine(),
      rows: [
        {
          blocks: [{ kind: "grid", layout: "row", images: [{ fileId: "f1", fit: "cover" }, null] }],
        },
      ],
    };
    await savePageZine(db, page.id, zine);
    const stored = await db.pages.get(page.id);
    expect(stored?.zine).toEqual(zine);
    expect(isPageEmpty(stored!)).toBe(false);
  });

  it("changes the kind of an empty page only", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const zine = await setPageKind(db, firstPage.id, "zine");
    expect(zine.kind).toBe("zine");
    expect(zine.columns).toEqual([]);
    expect(zine.zine).toEqual(emptyZine());
    expect(zine.createdAt).toBe(firstPage.createdAt);
    const lined = await setPageKind(db, firstPage.id, "lined");
    expect(lined.kind).toBe("lined");
    expect(lined.columns).toEqual([columnFromText("")]);
    expect(lined.zine).toBeUndefined();
    expect((await db.pages.get(firstPage.id))?.zine).toBeUndefined();
    await savePageText(db, firstPage.id, [columnFromText("written")]);
    await expect(setPageKind(db, firstPage.id, "zine")).rejects.toThrow(/empty/);
    expect((await listPages(db, notebook.id))[0].kind).toBe("lined");
  });

  it("upgrades pages from version 3 of the database to lined", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(3).stores({
      notebooks: "id, lastOpenedAt",
      pages: "id, notebookId, [notebookId+createdAt]",
      canvases: "notebookId",
      files: "[notebookId+id], notebookId",
    });
    await old
      .table("pages")
      .add({ id: "p1", notebookId: "nb", createdAt: 1, columns: [columnFromText("a")] });
    old.close();
    const upgraded = new TypestillDb(name);
    try {
      expect((await upgraded.pages.get("p1"))?.kind).toBe("lined");
    } finally {
      await upgraded.delete();
    }
  });

  it("upgrades version 6 zine pages to rows of blocks and drops the date stamp fields", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(6).stores({
      notebooks: "id, lastOpenedAt",
      pages: "id, notebookId, [notebookId+createdAt]",
      canvases: "notebookId",
      files: "[notebookId+id], notebookId",
      thumbnails: "pageId, notebookId",
    });
    await old.table("notebooks").add({
      id: "nb",
      lastOpenedAt: 1,
      defaults: { showDate: true, showPageNumber: false, margin: 20, divider: null },
    });
    await old.table("pages").bulkAdd([
      { id: "p1", notebookId: "nb", createdAt: 1, kind: "lined", showDate: true, columns: [] },
      {
        id: "p2",
        notebookId: "nb",
        createdAt: 2,
        kind: "zine",
        showDate: false,
        columns: [],
        zine: {
          padding: 4,
          media: { layout: "row", images: [{ fileId: "f1", fit: "cover" }, null] },
          textBelow: columnFromText("caption"),
          textBeside: columnFromText("aside"),
          textSide: "right",
          textRows: 2,
        },
      },
    ]);
    old.close();
    const upgraded = new TypestillDb(name);
    try {
      const notebook = await upgraded.notebooks.get("nb");
      expect(notebook?.defaults).toEqual({ showPageNumber: false, margin: 20, divider: null });
      const lined = await upgraded.pages.get("p1");
      expect(lined && "showDate" in lined).toBe(false);
      const zine = await upgraded.pages.get("p2");
      expect(zine && "showDate" in zine).toBe(false);
      expect(zine?.zine).toEqual({
        padding: 4,
        rows: [
          {
            blocks: [
              { kind: "grid", layout: "row", images: [{ fileId: "f1", fit: "cover" }, null] },
              { kind: "text", column: columnFromText("aside"), rows: 2 },
            ],
          },
          { blocks: [{ kind: "text", column: columnFromText("caption"), rows: 2 }] },
        ],
      });
    } finally {
      await upgraded.delete();
    }
  });

  it("upgrades plain-text columns from version 1 of the database", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      notebooks: "id, lastOpenedAt",
      pages: "id, notebookId, [notebookId+createdAt]",
      canvases: "notebookId",
      files: "[notebookId+id], notebookId",
    });
    await old
      .table("pages")
      .add({ id: "p1", notebookId: "nb", createdAt: 1, columns: ["a\nb", ""] });
    old.close();
    const upgraded = new TypestillDb(name);
    try {
      const page = await upgraded.pages.get("p1");
      expect(page?.columns).toEqual([
        { text: "a\nb", doc: documentFromText("a\nb") },
        { text: "", doc: documentFromText("") },
      ]);
      expect(page?.columns[0].doc.content).toHaveLength(2);
    } finally {
      await upgraded.delete();
    }
  });
});

describe("thumbnails", () => {
  it("caches thumbnails by page and drops them with the page or the notebook", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const second = await createPage(db, notebook.id);
    await saveThumbnail(db, notebook.id, firstPage.id, "data:image/png;base64,AAAA");
    await saveThumbnail(db, notebook.id, second.id, "data:image/png;base64,BBBB");
    await saveThumbnail(db, notebook.id, second.id, "data:image/png;base64,CCCC");
    expect(await loadThumbnails(db, notebook.id)).toEqual({
      [firstPage.id]: "data:image/png;base64,AAAA",
      [second.id]: "data:image/png;base64,CCCC",
    });
    await deletePage(db, second.id);
    expect(Object.keys(await loadThumbnails(db, notebook.id))).toEqual([firstPage.id]);
    await deleteNotebook(db, notebook.id);
    expect(await db.thumbnails.count()).toBe(0);
  });
});

describe("tags", () => {
  it("adds, updates and deletes tags, untagging pages on delete", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const tag = await addTag(db, notebook.id, { name: " Ideas ", color: "#b8342c" });
    expect(tag.name).toBe("Ideas");
    const other = await addTag(db, notebook.id, { name: "Quotes", color: "#2f5b9e" });
    expect((await db.notebooks.get(notebook.id))?.tags).toEqual([tag, other]);
    await updateTag(db, notebook.id, tag.id, { name: "Plans", color: "#2e7d4f" });
    expect((await db.notebooks.get(notebook.id))?.tags[0]).toEqual({
      id: tag.id,
      name: "Plans",
      color: "#2e7d4f",
    });
    const second = await createPage(db, notebook.id);
    await updatePage(db, firstPage.id, { tagId: tag.id });
    await updatePage(db, second.id, { tagId: other.id });
    expect(await deleteTag(db, notebook.id, tag.id)).toBe(1);
    expect((await db.notebooks.get(notebook.id))?.tags).toEqual([other]);
    expect((await db.pages.get(firstPage.id))?.tagId).toBeNull();
    expect((await db.pages.get(second.id))?.tagId).toBe(other.id);
  });
});

describe("clippings", () => {
  it("are saved with the page, count as content and as uses of their files", async () => {
    const { notebook, firstPage: page } = await createNotebook(db, { name: "A" });
    expect(page.clippings).toEqual([]);
    await addFile(db, notebook.id, fileData("f1"));
    const clippings = [{ id: "c1", fileId: "f1", x: 10, y: 20, width: 40, layer: "over" as const }];
    await updatePage(db, page.id, { clippings });
    const stored = (await listPages(db, notebook.id))[0];
    expect(stored.clippings).toEqual(clippings);
    expect(isPageEmpty(stored)).toBe(false);
    expect([...(await usedFileIds(db, notebook.id))]).toEqual(["f1"]);
    await expect(deleteFile(db, notebook.id, "f1")).rejects.toThrow(FileInUseError);
    expect(await pruneFiles(db, notebook.id)).toBe(0);
    await updatePage(db, page.id, { clippings: [] });
    expect(await pruneFiles(db, notebook.id)).toBe(1);
  });

  it("are given to pages from version 8 of the database", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(8).stores({
      notebooks: "id, lastOpenedAt",
      pages: "id, notebookId, [notebookId+createdAt]",
      canvases: "notebookId",
      files: "[notebookId+id], notebookId",
      thumbnails: "pageId, notebookId",
    });
    await old
      .table("pages")
      .add({ id: "p1", notebookId: "nb", createdAt: 1, kind: "lined", columns: [] });
    old.close();
    const upgraded = new TypestillDb(name);
    try {
      expect((await upgraded.pages.get("p1"))?.clippings).toEqual([]);
    } finally {
      await upgraded.delete();
    }
  });
});

describe("files", () => {
  it("stores an image once and counts zine pages and the canvas as uses", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    await addFile(db, notebook.id, fileData("f1"));
    await addFile(db, notebook.id, fileData("f1"));
    await addFile(db, notebook.id, fileData("f2"));
    await addFile(db, notebook.id, fileData("f3"));
    expect(await db.files.count()).toBe(3);
    const page = await createPage(db, notebook.id, { kind: "zine" });
    await savePageZine(db, page.id, {
      ...emptyZine(),
      rows: [{ blocks: [{ kind: "image", image: { fileId: "f1", fit: "cover" } }] }],
    });
    await saveCanvasContent(db, notebook.id, [imageElement("img", "f2")], {});
    expect([...(await usedFileIds(db, notebook.id))].sort()).toEqual(["f1", "f2"]);
    await expect(deleteFile(db, notebook.id, "f1")).rejects.toThrow(FileInUseError);
    await expect(deleteFile(db, notebook.id, "f2")).rejects.toThrow(/in use/);
    await deleteFile(db, notebook.id, "f3");
    expect(await db.files.count()).toBe(2);
    await addFile(db, notebook.id, fileData("f3"));
    expect(await pruneFiles(db, notebook.id)).toBe(1);
    expect(Object.keys(await loadNotebookFiles(db, notebook.id)).sort()).toEqual(["f1", "f2"]);
  });
});

describe("canvas", () => {
  it("saves content without deleted elements and stores referenced files once", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    const files = { f1: fileData("f1"), unused: fileData("unused") };
    await saveCanvasContent(
      db,
      notebook.id,
      [element("a"), element("gone", { isDeleted: true }), imageElement("img", "f1")],
      files,
    );
    const canvas = await getCanvas(db, notebook.id);
    expect(canvas.elements.map((e) => e.id)).toEqual(["a", "img"]);
    expect(Object.keys(await loadNotebookFiles(db, notebook.id))).toEqual(["f1"]);

    // Saving again with the same file does not fail on the primary key.
    await saveCanvasContent(db, notebook.id, [imageElement("img", "f1")], files);
    expect(await db.files.count()).toBe(1);
  });

  it("toggles the grid", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    await setCanvasGrid(db, notebook.id, false);
    expect((await getCanvas(db, notebook.id)).gridEnabled).toBe(false);
  });

  it("prunes files the canvas no longer references", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    await saveCanvasContent(db, notebook.id, [imageElement("img", "f1")], { f1: fileData("f1") });
    await saveCanvasContent(db, notebook.id, [element("a")], {});
    expect(await pruneFiles(db, notebook.id)).toBe(1);
    expect(await db.files.count()).toBe(0);
  });
});

describe("export and import", () => {
  it("round-trips a notebook document", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    await savePageText(db, firstPage.id, [columnFromText("some text")]);
    await saveCanvasContent(db, notebook.id, [imageElement("img", "f1")], { f1: fileData("f1") });
    await createPage(db, notebook.id);
    const doc = await exportNotebook(db, notebook.id);
    expect(doc?.pages).toHaveLength(2);
    expect(doc?.canvas.elements).toHaveLength(1);
    expect(Object.keys(doc?.files ?? {})).toEqual(["f1"]);

    const other = new TypestillDb(`test-${crypto.randomUUID()}`);
    try {
      await importNotebook(other, doc!);
      expect(await exportNotebook(other, notebook.id)).toEqual(doc);
    } finally {
      await other.delete();
    }
  });

  it("refuses to overwrite an existing notebook unless asked", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    const doc = (await exportNotebook(db, notebook.id))!;
    await expect(importNotebook(db, { ...doc, name: "A2" })).rejects.toBeInstanceOf(
      NotebookExistsError,
    );
    expect((await db.notebooks.get(notebook.id))?.name).toBe("A");
    await importNotebook(db, { ...doc, name: "A2" }, { replace: true });
    expect((await db.notebooks.get(notebook.id))?.name).toBe("A2");
    expect(await db.notebooks.count()).toBe(1);
    expect(await db.canvases.count()).toBe(1);
  });
});
