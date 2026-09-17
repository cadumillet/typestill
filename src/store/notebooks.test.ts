import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TypestillDb } from "./db";
import { element, fileData, imageElement } from "./fixtures";
import {
  NotebookExistsError,
  createNotebook,
  createPage,
  deleteNotebook,
  deletePage,
  exportNotebook,
  getCanvas,
  importNotebook,
  listNotebooks,
  listPages,
  loadNotebookFiles,
  pruneFiles,
  saveCanvasContent,
  savePageText,
  setCanvasGrid,
  setLastPage,
  setPageDivider,
  touchNotebook,
  updateNotebookSettings,
  updatePage,
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
    expect(firstPage.notebookId).toBe(notebook.id);
    expect(firstPage.columns).toEqual([""]);
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
    expect(a.columns).toEqual(["", ""]);
    const b = await createPage(db, notebook.id, { divider: null });
    expect(b.divider).toBeNull();
    expect(b.columns).toEqual([""]);
  });

  it("saves text, updates settings and deletes pages", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const second = await createPage(db, notebook.id);
    await savePageText(db, second.id, ["hello"]);
    await updatePage(db, second.id, {
      showDate: false,
      canvasView: { scrollX: 1, scrollY: 2, zoom: 0.5 },
    });
    const stored = await db.pages.get(second.id);
    expect(stored?.columns).toEqual(["hello"]);
    expect(stored?.showDate).toBe(false);
    expect(stored?.canvasView).toEqual({ scrollX: 1, scrollY: 2, zoom: 0.5 });
    await deletePage(db, firstPage.id);
    expect((await listPages(db, notebook.id)).map((p) => p.id)).toEqual([second.id]);
  });

  it("adds, moves and removes the divider without losing text", async () => {
    const { firstPage } = await createNotebook(db, { name: "A" });
    await savePageText(db, firstPage.id, ["left"]);
    await setPageDivider(db, firstPage.id, 70);
    expect((await db.pages.get(firstPage.id))?.columns).toEqual(["left", ""]);
    await savePageText(db, firstPage.id, ["left", "right"]);
    await setPageDivider(db, firstPage.id, 80);
    expect((await db.pages.get(firstPage.id))?.divider).toBe(80);
    expect((await db.pages.get(firstPage.id))?.columns).toEqual(["left", "right"]);
    await setPageDivider(db, firstPage.id, null);
    expect((await db.pages.get(firstPage.id))?.columns).toEqual(["left\nright"]);
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
    await savePageText(db, firstPage.id, ["some text"]);
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
