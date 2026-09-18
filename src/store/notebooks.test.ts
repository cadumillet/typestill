import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_COVER } from "../notebook/cover";
import { columnFromText, documentFromText } from "../page/document";
import { TypestillDb } from "./db";
import { element, fileData, imageElement } from "./fixtures";
import { emptyZine, type Zine } from "../page/zine";
import {
  FileInUseError,
  LastSectionError,
  NotebookExistsError,
  addFile,
  addSection,
  createNotebook,
  deleteFile,
  createPage,
  deleteNotebook,
  deletePage,
  deleteSection,
  exportNotebook,
  getCanvas,
  importNotebook,
  listNotebooks,
  listPages,
  loadNotebookFiles,
  loadThumbnails,
  isPageEmpty,
  moveSection,
  neighbourIndex,
  pruneFiles,
  saveCanvasContent,
  savePageDrawing,
  savePageText,
  savePageZine,
  saveThumbnail,
  setCanvasGrid,
  setLastPage,
  setPageDivider,
  setPageKind,
  setSectionLastPage,
  touchNotebook,
  updateNotebookSettings,
  updatePage,
  updateSection,
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
  it("creates a notebook with one section, one empty page in it and an empty canvas", async () => {
    const { notebook, firstPage } = await createNotebook(db, {
      name: "Field notes",
      cover: { color: "#2f5b9e" },
    });
    expect(notebook.pageSize).toBe("A5");
    expect(notebook.orientation).toBe("portrait");
    expect(notebook.cover).toEqual({ ...DEFAULT_COVER, color: "#2f5b9e" });
    expect(notebook.themeId).toBe("ruled");
    expect(notebook.sections).toHaveLength(1);
    const [notes] = notebook.sections;
    expect(notes).toEqual({ id: notes.id, name: "Notes", color: "#2f5b9e", lastPageId: null });
    expect((await db.notebooks.get(notebook.id))?.sections).toEqual([notes]);
    expect(firstPage.notebookId).toBe(notebook.id);
    expect(firstPage.sectionId).toBe(notes.id);
    expect(firstPage.kind).toBe("lined");
    expect(firstPage.columns).toEqual([columnFromText("")]);
    expect(firstPage.divider).toBeNull();
    expect(firstPage.margin).toBe(20);
    expect(firstPage.drawing).toEqual([]);
    expect(firstPage.drawingLayer).toBe("over");
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

  it("adds pages to the first section unless one is given, and refuses an unknown one", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const notes = notebook.sections[0];
    const other = await addSection(db, notebook.id, { name: "Quotes", color: "#2f5b9e" });
    expect((await createPage(db, notebook.id)).sectionId).toBe(notes.id);
    const quoted = await createPage(db, notebook.id, { sectionId: other.id, kind: "zine" });
    expect(quoted.sectionId).toBe(other.id);
    expect(quoted.kind).toBe("zine");
    await expect(createPage(db, notebook.id, { sectionId: "missing" })).rejects.toThrow(
      /Section missing not found/,
    );
    expect((await listPages(db, notebook.id)).map((p) => p.sectionId)).toEqual([
      notes.id,
      notes.id,
      other.id,
    ]);
    expect((await db.pages.get(firstPage.id))?.sectionId).toBe(notes.id);
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
      drawingLayer: "under",
      canvasView: { scrollX: 1, scrollY: 2, zoom: 0.5 },
    });
    const stored = await db.pages.get(second.id);
    expect(stored?.columns).toEqual([columnFromText("hello")]);
    expect(stored?.showPageNumber).toBe(false);
    expect(stored?.drawingLayer).toBe("under");
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

  it("picks the neighbour in notebook order, and a section forgets a deleted page", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const quotes = await addSection(db, notebook.id, { name: "Quotes", color: "#2f5b9e" });
    // Creation order: first, quoted, second; notebook order: first, second, quoted.
    const quoted = await createPage(db, notebook.id, { sectionId: quotes.id });
    const second = await createPage(db, notebook.id);
    await setSectionLastPage(db, notebook.id, quotes.id, quoted.id);
    await setSectionLastPage(db, notebook.id, notebook.sections[0].id, second.id);
    expect((await deletePage(db, quoted.id)).id).toBe(second.id);
    expect((await db.notebooks.get(notebook.id))?.sections.map((s) => s.lastPageId)).toEqual([
      second.id,
      null,
    ]);
    // The first page of a later section has the last page of the previous one before it.
    const again = await createPage(db, notebook.id, { sectionId: quotes.id });
    expect((await deletePage(db, again.id)).id).toBe(second.id);
    expect((await deletePage(db, second.id)).id).toBe(firstPage.id);
    expect((await db.notebooks.get(notebook.id))?.sections.map((s) => s.lastPageId)).toEqual([
      null,
      null,
    ]);
  });

  it("replaces the only page with a fresh lined page from the defaults, in its section", async () => {
    const { notebook, firstPage } = await createNotebook(db, {
      name: "A",
      defaults: { divider: 70 },
    });
    const quotes = await addSection(db, notebook.id, { name: "Quotes", color: "#2f5b9e" });
    await updatePage(db, firstPage.id, { sectionId: quotes.id });
    const zine = await setPageKind(db, firstPage.id, "zine");
    expect(zine.sectionId).toBe(quotes.id);
    await savePageZine(db, zine.id, {
      ...emptyZine(),
      rows: [{ blocks: [{ kind: "image", image: { fileId: "f1", fit: "cover" } }] }],
    });
    await addFile(db, notebook.id, fileData("f1"));
    await updatePage(db, zine.id, { showPageNumber: false, margin: 30 });
    const fresh = await deletePage(db, zine.id);
    expect(fresh.id).not.toBe(zine.id);
    expect(fresh.sectionId).toBe(quotes.id);
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

  it("changes the kind of an empty page only, keeping its drawing", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    await savePageDrawing(db, firstPage.id, [element("a")], {});
    await updatePage(db, firstPage.id, { drawingLayer: "under" });
    const zine = await setPageKind(db, firstPage.id, "zine");
    expect(zine.kind).toBe("zine");
    expect(zine.columns).toEqual([]);
    expect(zine.zine).toEqual(emptyZine());
    expect(zine.createdAt).toBe(firstPage.createdAt);
    expect(zine.drawing).toEqual([element("a")]);
    expect(zine.drawingLayer).toBe("under");
    const lined = await setPageKind(db, firstPage.id, "lined");
    expect(lined.kind).toBe("lined");
    expect(lined.columns).toEqual([columnFromText("")]);
    expect(lined.zine).toBeUndefined();
    expect(lined.drawing).toEqual([element("a")]);
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

  it("gives pages from version 8 of the database an empty drawing over the text", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(8).stores({
      notebooks: "id, lastOpenedAt",
      pages: "id, notebookId, [notebookId+createdAt]",
      canvases: "notebookId",
      files: "[notebookId+id], notebookId",
      thumbnails: "pageId, notebookId",
    });
    await old.table("notebooks").add({ id: "nb", lastOpenedAt: 1, cover: DEFAULT_COVER, tags: [] });
    const before = [
      {
        id: "p1",
        notebookId: "nb",
        createdAt: 1,
        kind: "lined",
        showPageNumber: false,
        margin: 25,
        columns: [columnFromText("a"), columnFromText("b")],
        divider: 70,
        canvasView: { scrollX: 1, scrollY: 2, zoom: 0.5 },
      },
      {
        id: "p2",
        notebookId: "nb",
        createdAt: 2,
        kind: "zine",
        showPageNumber: true,
        margin: 20,
        columns: [],
        zine: emptyZine(),
        divider: null,
        canvasView: null,
      },
    ];
    await old.table("pages").bulkAdd(before);
    old.close();
    const upgraded = new TypestillDb(name);
    try {
      const notes = (await upgraded.notebooks.get("nb"))!.sections[0];
      const pages = await listPages(upgraded, "nb");
      expect(pages).toEqual(
        before.map((page) => ({ ...page, sectionId: notes.id, drawing: [], drawingLayer: "over" })),
      );
    } finally {
      await upgraded.delete();
    }
  });

  it("turns tags from version 9 of the database into sections", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(9).stores({
      notebooks: "id, lastOpenedAt",
      pages: "id, notebookId, [notebookId+createdAt]",
      canvases: "notebookId",
      files: "[notebookId+id], notebookId",
      thumbnails: "pageId, notebookId",
    });
    await old.table("notebooks").add({
      id: "nb",
      lastOpenedAt: 1,
      cover: { color: "#2e7d4f", emoji: null, subtitle: null },
      tags: [
        { id: "t1", name: "Ideas", color: "#b8342c" },
        { id: "t2", name: "Quotes", color: "#2f5b9e" },
      ],
    });
    await old.table("pages").bulkAdd([
      { id: "p1", notebookId: "nb", createdAt: 1, tagId: null },
      { id: "p2", notebookId: "nb", createdAt: 2, tagId: "t2" },
      { id: "p3", notebookId: "nb", createdAt: 3, tagId: "gone" },
      { id: "p4", notebookId: "nb", createdAt: 4, tagId: "t1" },
    ]);
    old.close();
    const upgraded = new TypestillDb(name);
    try {
      const notebook = (await upgraded.notebooks.get("nb"))!;
      expect("tags" in notebook).toBe(false);
      const [notes, ideas, quotes] = notebook.sections;
      expect(notebook.sections).toHaveLength(3);
      expect(notes).toEqual({ id: notes.id, name: "Notes", color: "#2e7d4f", lastPageId: null });
      expect(ideas).toEqual({ id: "t1", name: "Ideas", color: "#b8342c", lastPageId: null });
      expect(quotes).toEqual({ id: "t2", name: "Quotes", color: "#2f5b9e", lastPageId: null });
      const pages = await listPages(upgraded, "nb");
      expect(pages.map((page) => page.sectionId)).toEqual([notes.id, "t2", notes.id, "t1"]);
      expect(pages.some((page) => "tagId" in page)).toBe(false);
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

describe("sections", () => {
  const sectionsOf = async (notebookId: string) => (await db.notebooks.get(notebookId))!.sections;

  it("adds sections at the end and updates them", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    const [notes] = notebook.sections;
    const ideas = await addSection(db, notebook.id, { name: " Ideas ", color: "#b8342c" });
    expect(ideas).toEqual({ id: ideas.id, name: "Ideas", color: "#b8342c", lastPageId: null });
    const quotes = await addSection(db, notebook.id, { name: "Quotes", color: "#2f5b9e" });
    expect(await sectionsOf(notebook.id)).toEqual([notes, ideas, quotes]);
    await updateSection(db, notebook.id, ideas.id, { name: "Plans", color: "#2e7d4f" });
    expect((await sectionsOf(notebook.id))[1]).toEqual({
      id: ideas.id,
      name: "Plans",
      color: "#2e7d4f",
      lastPageId: null,
    });
  });

  it("moves a section by one place, staying put at the ends", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    const [notes] = notebook.sections;
    const ideas = await addSection(db, notebook.id, { name: "Ideas", color: "#b8342c" });
    const quotes = await addSection(db, notebook.id, { name: "Quotes", color: "#2f5b9e" });
    const order = async () => (await sectionsOf(notebook.id)).map((s) => s.id);
    await moveSection(db, notebook.id, quotes.id, -1);
    expect(await order()).toEqual([notes.id, quotes.id, ideas.id]);
    await moveSection(db, notebook.id, notes.id, 1);
    expect(await order()).toEqual([quotes.id, notes.id, ideas.id]);
    await moveSection(db, notebook.id, quotes.id, -1);
    expect(await order()).toEqual([quotes.id, notes.id, ideas.id]);
    await moveSection(db, notebook.id, ideas.id, 1);
    expect(await order()).toEqual([quotes.id, notes.id, ideas.id]);
    await moveSection(db, notebook.id, "missing", 1);
    expect(await order()).toEqual([quotes.id, notes.id, ideas.id]);
  });

  it("deletes a section, moving its pages to the one before it, or after it for the first", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const [notes] = notebook.sections;
    const ideas = await addSection(db, notebook.id, { name: "Ideas", color: "#b8342c" });
    const quotes = await addSection(db, notebook.id, { name: "Quotes", color: "#2f5b9e" });
    const a = await createPage(db, notebook.id, { sectionId: quotes.id });
    const b = await createPage(db, notebook.id, { sectionId: quotes.id });
    expect(await deleteSection(db, notebook.id, quotes.id)).toEqual({ movedTo: ideas, count: 2 });
    expect(await sectionsOf(notebook.id)).toEqual([notes, ideas]);
    expect((await db.pages.get(a.id))?.sectionId).toBe(ideas.id);
    expect((await db.pages.get(b.id))?.sectionId).toBe(ideas.id);
    expect(await deleteSection(db, notebook.id, notes.id)).toEqual({ movedTo: ideas, count: 1 });
    expect(await sectionsOf(notebook.id)).toEqual([ideas]);
    expect((await db.pages.get(firstPage.id))?.sectionId).toBe(ideas.id);
    await expect(deleteSection(db, notebook.id, ideas.id)).rejects.toThrow(LastSectionError);
    await expect(deleteSection(db, notebook.id, "missing")).rejects.toThrow(/not found/);
    expect(await sectionsOf(notebook.id)).toEqual([ideas]);
    expect(await db.pages.count()).toBe(3);
  });

  it("remembers where each section was left", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const [notes] = notebook.sections;
    const ideas = await addSection(db, notebook.id, { name: "Ideas", color: "#b8342c" });
    await setSectionLastPage(db, notebook.id, notes.id, firstPage.id);
    expect((await sectionsOf(notebook.id)).map((s) => s.lastPageId)).toEqual([firstPage.id, null]);
    await setSectionLastPage(db, notebook.id, notes.id, null);
    await setSectionLastPage(db, notebook.id, ideas.id, firstPage.id);
    expect((await sectionsOf(notebook.id)).map((s) => s.lastPageId)).toEqual([null, firstPage.id]);
  });
});

describe("files", () => {
  it("stores an image once and counts zine pages, page drawings and the canvas as uses", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    await addFile(db, notebook.id, fileData("f1"));
    await addFile(db, notebook.id, fileData("f1"));
    await addFile(db, notebook.id, fileData("f2"));
    await addFile(db, notebook.id, fileData("f3"));
    await addFile(db, notebook.id, fileData("f4"));
    expect(await db.files.count()).toBe(4);
    const page = await createPage(db, notebook.id, { kind: "zine" });
    await savePageZine(db, page.id, {
      ...emptyZine(),
      rows: [{ blocks: [{ kind: "image", image: { fileId: "f1", fit: "cover" } }] }],
    });
    await saveCanvasContent(db, notebook.id, [imageElement("img", "f2")], {});
    await savePageDrawing(db, firstPage.id, [imageElement("drawn", "f4")], {});
    expect([...(await usedFileIds(db, notebook.id))].sort()).toEqual(["f1", "f2", "f4"]);
    await expect(deleteFile(db, notebook.id, "f1")).rejects.toThrow(FileInUseError);
    await expect(deleteFile(db, notebook.id, "f2")).rejects.toThrow(/in use/);
    await expect(deleteFile(db, notebook.id, "f4")).rejects.toThrow(FileInUseError);
    await deleteFile(db, notebook.id, "f3");
    expect(await db.files.count()).toBe(3);
    await addFile(db, notebook.id, fileData("f3"));
    expect(await pruneFiles(db, notebook.id)).toBe(1);
    expect(Object.keys(await loadNotebookFiles(db, notebook.id)).sort()).toEqual([
      "f1",
      "f2",
      "f4",
    ]);
  });
});

describe("page drawings", () => {
  it("saves a drawing without deleted elements and stores referenced files once", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const files = { f1: fileData("f1"), unused: fileData("unused") };
    await savePageDrawing(
      db,
      firstPage.id,
      [element("a"), element("gone", { isDeleted: true }), imageElement("img", "f1")],
      files,
    );
    const stored = await db.pages.get(firstPage.id);
    expect(stored?.drawing.map((e) => e.id)).toEqual(["a", "img"]);
    expect(Object.keys(await loadNotebookFiles(db, notebook.id))).toEqual(["f1"]);

    // Saving again with the same file does not fail on the primary key.
    await savePageDrawing(db, firstPage.id, [imageElement("img", "f1")], files);
    expect(await db.files.count()).toBe(1);
  });

  it("refuses to save a drawing on a page that does not exist", async () => {
    await createNotebook(db, { name: "A" });
    await expect(savePageDrawing(db, "missing", [element("a")], {})).rejects.toThrow(/not found/);
  });

  it("prunes files no page drawing references any more", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    await savePageDrawing(db, firstPage.id, [imageElement("img", "f1")], { f1: fileData("f1") });
    expect(await pruneFiles(db, notebook.id)).toBe(0);
    await savePageDrawing(db, firstPage.id, [element("a")], {});
    expect(await pruneFiles(db, notebook.id)).toBe(1);
    expect(await db.files.count()).toBe(0);
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
    await savePageDrawing(db, firstPage.id, [element("a")], {});
    await saveCanvasContent(db, notebook.id, [imageElement("img", "f1")], { f1: fileData("f1") });
    await createPage(db, notebook.id);
    const doc = await exportNotebook(db, notebook.id);
    expect(doc?.pages).toHaveLength(2);
    expect(doc?.pages[0].drawing).toEqual([element("a")]);
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
