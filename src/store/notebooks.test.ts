import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_COVER } from "../notebook/cover";
import { columnFromText, documentFromText } from "../page/document";
import { TypestillDb } from "./db";
import { element, fileData, imageElement } from "./fixtures";
import { emptyZine, type Zine } from "../page/zine";
import { SHEET } from "./model";
import {
  FileInUseError,
  FirstSectionError,
  NotebookExistsError,
  NotebookNotBlankError,
  SectionPastEndError,
  addFile,
  clearPage,
  createNotebook,
  cutSection,
  deleteFile,
  deleteNotebook,
  exportNotebook,
  getCanvas,
  growNotebook,
  importNotebook,
  isPageBlank,
  isPageEmpty,
  listNotebooks,
  listPages,
  loadNotebookFiles,
  loadThumbnails,
  moveCut,
  pruneFiles,
  removeCut,
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
  shrinkNotebook,
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

/** The Dexie schema before version 11, for upgrade tests. */
const OLD_STORES = {
  notebooks: "id, lastOpenedAt",
  pages: "id, notebookId, [notebookId+createdAt]",
  canvases: "notebookId",
  files: "[notebookId+id], notebookId",
};

describe("notebooks", () => {
  it("creates a notebook whole: one section, every page blank in its slot, an empty canvas", async () => {
    const { notebook, firstPage } = await createNotebook(db, {
      name: "Field notes",
      cover: { color: "#2f5b9e" },
    });
    expect(notebook.pageSize).toBe("A5");
    expect(notebook.orientation).toBe("portrait");
    expect(notebook.cover).toEqual({ ...DEFAULT_COVER, color: "#2f5b9e" });
    expect(notebook.themeId).toBe("ruled");
    expect(notebook.size).toBe(96);
    expect(notebook.sections).toHaveLength(1);
    const [notes] = notebook.sections;
    expect(notes).toEqual({
      id: notes.id,
      name: "Notes",
      color: "#2f5b9e",
      start: 0,
      lastPageId: null,
    });
    expect((await db.notebooks.get(notebook.id))?.sections).toEqual([notes]);
    expect(firstPage.notebookId).toBe(notebook.id);
    expect(firstPage.position).toBe(0);
    expect(firstPage.fill).toBe(0);
    expect(firstPage.kind).toBe("lined");
    expect(firstPage.columns).toEqual([columnFromText("")]);
    expect(firstPage.divider).toBeNull();
    expect(firstPage.margin).toBe(20);
    expect(firstPage.drawing).toEqual([]);
    expect(firstPage.drawingLayer).toBe("over");
    expect(firstPage.canvasView).toBeNull();
    expect(notebook.lastPageId).toBe(firstPage.id);
    expect((await db.notebooks.get(notebook.id))?.lastPageId).toBe(firstPage.id);
    const pages = await listPages(db, notebook.id);
    expect(pages).toHaveLength(96);
    expect(pages[0]).toEqual(firstPage);
    expect(pages.map((page) => page.position)).toEqual([...Array(96).keys()]);
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i].createdAt).toBeGreaterThan(pages[i - 1].createdAt);
    }
    expect(pages.every((page) => isPageBlank(page))).toBe(true);
    expect(await getCanvas(db, notebook.id)).toEqual({
      notebookId: notebook.id,
      gridEnabled: true,
      elements: [],
    });
  });

  it("makes a notebook of the size asked, whole sheets only", async () => {
    const { notebook } = await createNotebook(db, { name: "A", size: 64 });
    expect(notebook.size).toBe(64);
    expect(await listPages(db, notebook.id)).toHaveLength(64);
    for (const size of [0, -4, 5, 66, 2.5]) {
      await expect(createNotebook(db, { name: "B", size })).rejects.toThrow(/multiple of 4/);
    }
    expect(await db.notebooks.count()).toBe(1);
  });

  it("lists notebooks most recently opened first with page counts", async () => {
    const a = await createNotebook(db, { name: "A", size: 64 });
    const b = await createNotebook(db, { name: "B" });
    await touchNotebook(db, a.notebook.id);
    const list = await listNotebooks(db);
    expect(list.map((n) => n.name)).toEqual(["A", "B"]);
    expect(list[0].pageCount).toBe(64);
    expect(list[1].pageCount).toBe(96);
    expect(list[0].cover).toEqual(DEFAULT_COVER);
    expect(list[0].lastOpenedAt).toBeGreaterThanOrEqual(b.notebook.lastOpenedAt);
  });

  it("remembers the last page shown", async () => {
    const { notebook } = await createNotebook(db, { name: "A" });
    const second = (await listPages(db, notebook.id))[1];
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
    old.version(4).stores(OLD_STORES);
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
    old.version(2).stores(OLD_STORES);
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
    const other = await createNotebook(db, { name: "B", size: 64 });
    await saveCanvasContent(db, notebook.id, [imageElement("img", "f1")], { f1: fileData("f1") });
    await deleteNotebook(db, notebook.id);
    expect(await db.notebooks.count()).toBe(1);
    expect(await db.pages.count()).toBe(64);
    expect(await db.canvases.count()).toBe(1);
    expect(await db.files.count()).toBe(0);
    expect(await listPages(db, other.notebook.id)).toHaveLength(64);
  });
});

describe("size", () => {
  it("grows by whole sheets, appending blank pages to the last section", async () => {
    const { notebook } = await createNotebook(db, {
      name: "A",
      size: 64,
      defaults: { divider: 70 },
    });
    await cutSection(db, notebook.id, 60, { name: "Tail", color: "#111" });
    const before = await listPages(db, notebook.id);
    await growNotebook(db, notebook.id, 72);
    expect((await db.notebooks.get(notebook.id))?.size).toBe(72);
    const pages = await listPages(db, notebook.id);
    expect(pages).toHaveLength(72);
    expect(pages.slice(0, 64)).toEqual(before);
    expect(pages.slice(64).map((page) => page.position)).toEqual([64, 65, 66, 67, 68, 69, 70, 71]);
    for (let i = 64; i < 72; i++) {
      expect(pages[i].createdAt).toBeGreaterThan(pages[i - 1].createdAt);
      expect(pages[i].kind).toBe("lined");
      expect(pages[i].columns).toEqual([columnFromText(""), columnFromText("")]);
      expect(pages[i].fill).toBe(0);
    }
    for (const size of [72, 68, 70, 0]) {
      await expect(growNotebook(db, notebook.id, size)).rejects.toThrow(/larger multiple of 4/);
    }
    expect((await db.notebooks.get(notebook.id))?.sections.map((s) => s.start)).toEqual([0, 60]);
    await expect(growNotebook(db, "missing", 100)).rejects.toThrow(/not found/);
  });

  it("shrinks over blank pages only, dropping their thumbnails", async () => {
    const { notebook } = await createNotebook(db, { name: "A", size: 64 });
    const pages = await listPages(db, notebook.id);
    await saveThumbnail(db, notebook.id, pages[1].id, "data:image/png;base64,AAAA");
    await saveThumbnail(db, notebook.id, pages[63].id, "data:image/png;base64,BBBB");
    await setLastPage(db, notebook.id, pages[63].id);
    await setSectionLastPage(db, notebook.id, notebook.sections[0].id, pages[62].id);
    await shrinkNotebook(db, notebook.id, 56);
    const stored = (await db.notebooks.get(notebook.id))!;
    expect(stored.size).toBe(56);
    expect((await listPages(db, notebook.id)).map((page) => page.id)).toEqual(
      pages.slice(0, 56).map((page) => page.id),
    );
    expect(Object.keys(await loadThumbnails(db, notebook.id))).toEqual([pages[1].id]);
    // A remembered page that went is replaced by the new last page, or forgotten.
    expect(stored.lastPageId).toBe(pages[55].id);
    expect(stored.sections[0].lastPageId).toBeNull();
    for (const size of [56, 60, 0, 54, -4]) {
      await expect(shrinkNotebook(db, notebook.id, size)).rejects.toThrow(/smaller multiple of 4/);
    }
  });

  it("keeps a remembered page that stays", async () => {
    const { notebook } = await createNotebook(db, { name: "A", size: 64 });
    const pages = await listPages(db, notebook.id);
    await setLastPage(db, notebook.id, pages[3].id);
    await setSectionLastPage(db, notebook.id, notebook.sections[0].id, pages[2].id);
    await shrinkNotebook(db, notebook.id, 4);
    const stored = (await db.notebooks.get(notebook.id))!;
    expect(stored.lastPageId).toBe(pages[3].id);
    expect(stored.sections[0].lastPageId).toBe(pages[2].id);
    expect(await listPages(db, notebook.id)).toHaveLength(4);
  });

  it("refuses to shrink over a page with something on it, naming the first", async () => {
    const { notebook } = await createNotebook(db, { name: "A", size: 64 });
    const pages = await listPages(db, notebook.id);
    await savePageDrawing(db, pages[62].id, [element("a")], {});
    await savePageText(db, pages[60].id, [columnFromText("kept")]);
    const shrink = shrinkNotebook(db, notebook.id, 56);
    await expect(shrink).rejects.toThrow(NotebookNotBlankError);
    await expect(shrinkNotebook(db, notebook.id, 56)).rejects.toThrow(/Page 61/);
    // An erased drawing leaves the page blank.
    await savePageDrawing(db, pages[62].id, [element("a", { isDeleted: true })], {});
    await expect(shrinkNotebook(db, notebook.id, 56)).rejects.toThrow(/Page 61/);
    await clearPage(db, pages[60].id);
    await shrinkNotebook(db, notebook.id, 56);
    expect(await listPages(db, notebook.id)).toHaveLength(56);
  });

  it("refuses to shrink past a section's start", async () => {
    const { notebook } = await createNotebook(db, { name: "A", size: 64 });
    const late = await cutSection(db, notebook.id, 60, { name: "Late", color: "#111" });
    const shrink = shrinkNotebook(db, notebook.id, 60);
    await expect(shrink).rejects.toThrow(SectionPastEndError);
    await expect(shrinkNotebook(db, notebook.id, 60)).rejects.toThrow(/Late starts at page 61/);
    await expect(shrinkNotebook(db, notebook.id, 60)).rejects.toMatchObject({ section: late });
    expect((await db.notebooks.get(notebook.id))?.size).toBe(64);
    // Once the cut is gone the blank tail can go.
    await removeCut(db, notebook.id, late.id);
    await shrinkNotebook(db, notebook.id, 4);
    expect((await db.notebooks.get(notebook.id))?.size).toBe(4);
    expect(await listPages(db, notebook.id)).toHaveLength(4);
  });
});

describe("pages", () => {
  it("lists the pages by position, whatever order they were stored in", async () => {
    const { notebook } = await createNotebook(db, { name: "A", size: 8 });
    const pages = await listPages(db, notebook.id);
    await db.pages.bulkDelete(pages.map((page) => page.id));
    await db.pages.bulkAdd([...pages].reverse());
    expect((await listPages(db, notebook.id)).map((page) => page.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("saves text and settings, the fill alongside", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    await savePageText(db, firstPage.id, [columnFromText("hello")]);
    expect((await db.pages.get(firstPage.id))?.fill).toBe(0);
    await savePageText(db, firstPage.id, [columnFromText("hello")], 0.25);
    await updatePage(db, firstPage.id, {
      showPageNumber: false,
      drawingLayer: "under",
      canvasView: { scrollX: 1, scrollY: 2, zoom: 0.5 },
    });
    const stored = await db.pages.get(firstPage.id);
    expect(stored?.columns).toEqual([columnFromText("hello")]);
    expect(stored?.fill).toBe(0.25);
    expect(stored?.showPageNumber).toBe(false);
    expect(stored?.drawingLayer).toBe("under");
    expect(stored?.canvasView).toEqual({ scrollX: 1, scrollY: 2, zoom: 0.5 });
    await updatePage(db, firstPage.id, { fill: 1 });
    expect((await db.pages.get(firstPage.id))?.fill).toBe(1);
    await savePageDrawing(db, firstPage.id, [element("a")], {}, 0.5);
    expect((await db.pages.get(firstPage.id))?.fill).toBe(0.5);
    expect((await listPages(db, notebook.id))[0].position).toBe(0);
  });

  it("clears a lined page, keeping its slot, divider and margin", async () => {
    const { notebook } = await createNotebook(db, { name: "A", defaults: { divider: 70 } });
    const page = (await listPages(db, notebook.id))[2];
    await savePageText(db, page.id, [columnFromText("left"), columnFromText("right")], 0.6);
    await savePageDrawing(db, page.id, [element("a")], {});
    await updatePage(db, page.id, { margin: 30, drawingLayer: "under" });
    const cleared = await clearPage(db, page.id);
    expect(cleared).toEqual(await db.pages.get(page.id));
    expect(cleared).toEqual({
      ...page,
      margin: 30,
      drawingLayer: "under",
      columns: [columnFromText(""), columnFromText("")],
      drawing: [],
      fill: 0,
    });
    expect(isPageBlank(cleared)).toBe(true);
    expect((await listPages(db, notebook.id)).map((p) => p.id)).toContain(page.id);
    await expect(clearPage(db, "missing")).rejects.toThrow(/not found/);
  });

  it("clears a zine page, keeping its padding and leaving its images in the pool", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const zine = await setPageKind(db, firstPage.id, "zine");
    await addFile(db, notebook.id, fileData("f1"));
    await savePageZine(
      db,
      zine.id,
      {
        padding: 9,
        rows: [{ blocks: [{ kind: "image", image: { fileId: "f1", fit: "cover" } }] }],
      },
      0.5,
    );
    const cleared = await clearPage(db, zine.id);
    expect(cleared.zine).toEqual({ padding: 9, rows: [] });
    expect(cleared.fill).toBe(0);
    expect(cleared.columns).toEqual([]);
    expect(isPageEmpty(cleared)).toBe(true);
    expect(Object.keys(await loadNotebookFiles(db, notebook.id))).toEqual(["f1"]);
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

  it("makes zine pages with no rows and no columns", async () => {
    const { notebook, firstPage } = await createNotebook(db, {
      name: "A",
      defaults: { divider: 70 },
    });
    const page = await setPageKind(db, firstPage.id, "zine");
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
    await savePageZine(db, page.id, zine, 0.5);
    const stored = await db.pages.get(page.id);
    expect(stored?.zine).toEqual(zine);
    expect(stored?.fill).toBe(0.5);
    expect(isPageEmpty(stored!)).toBe(false);
    expect((await listPages(db, notebook.id))[0].kind).toBe("zine");
  });

  it("changes the kind of an empty page only, keeping its slot and drawing", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    await savePageDrawing(db, firstPage.id, [element("a")], {});
    await updatePage(db, firstPage.id, { drawingLayer: "under" });
    const zine = await setPageKind(db, firstPage.id, "zine");
    expect(zine.kind).toBe("zine");
    expect(zine.columns).toEqual([]);
    expect(zine.zine).toEqual(emptyZine());
    expect(zine.createdAt).toBe(firstPage.createdAt);
    expect(zine.position).toBe(0);
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

  it("tells an empty page from a blank one by its drawing", async () => {
    const { firstPage } = await createNotebook(db, { name: "A" });
    expect(isPageEmpty(firstPage)).toBe(true);
    expect(isPageBlank(firstPage)).toBe(true);
    const drawn = { ...firstPage, drawing: [element("a")] };
    expect(isPageEmpty(drawn)).toBe(true);
    expect(isPageBlank(drawn)).toBe(false);
    expect(isPageBlank({ ...firstPage, drawing: [element("a", { isDeleted: true })] })).toBe(true);
    expect(isPageBlank({ ...firstPage, columns: [columnFromText("x")] })).toBe(false);
  });

  it("upgrades pages from version 3 of the database to lined", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(3).stores(OLD_STORES);
    await old.table("notebooks").add({ id: "nb", lastOpenedAt: 1 });
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
    old.version(6).stores({ ...OLD_STORES, thumbnails: "pageId, notebookId" });
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
    old.version(8).stores({ ...OLD_STORES, thumbnails: "pageId, notebookId" });
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
      const pages = await listPages(upgraded, "nb");
      expect(pages.slice(0, 2)).toEqual(
        before.map((page, position) => ({
          ...page,
          position,
          fill: position === 0 ? 0.5 : 0,
          drawing: [],
          drawingLayer: "over",
        })),
      );
    } finally {
      await upgraded.delete();
    }
  });

  it("turns tags from version 9 of the database into sections", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(9).stores({ ...OLD_STORES, thumbnails: "pageId, notebookId" });
    await old.table("notebooks").add({
      id: "nb",
      lastOpenedAt: 1,
      cover: { color: "#2e7d4f", emoji: null, subtitle: null },
      tags: [
        { id: "t1", name: "Ideas", color: "#b8342c" },
        { id: "t2", name: "Quotes", color: "#2f5b9e" },
      ],
    });
    const page = (id: string, createdAt: number, tagId: string | null) => ({
      id,
      notebookId: "nb",
      createdAt,
      tagId,
      kind: "lined",
      columns: [columnFromText(id)],
      drawing: [],
    });
    await old
      .table("pages")
      .bulkAdd([
        page("p1", 1, null),
        page("p2", 2, "t2"),
        page("p3", 3, "gone"),
        page("p4", 4, "t1"),
      ]);
    old.close();
    const upgraded = new TypestillDb(name);
    try {
      const notebook = (await upgraded.notebooks.get("nb"))!;
      expect("tags" in notebook).toBe(false);
      const [notes, ideas, quotes] = notebook.sections;
      expect(notebook.sections).toHaveLength(3);
      expect(notes).toEqual({
        id: notes.id,
        name: "Notes",
        color: "#2e7d4f",
        start: 0,
        lastPageId: null,
      });
      expect(ideas).toEqual({
        id: "t1",
        name: "Ideas",
        color: "#b8342c",
        start: 4,
        lastPageId: null,
      });
      expect(quotes).toEqual({
        id: "t2",
        name: "Quotes",
        color: "#2f5b9e",
        start: 8,
        lastPageId: null,
      });
      const pages = await listPages(upgraded, "nb");
      expect(pages.slice(0, 12).map((page) => page.columns[0].text)).toEqual([
        "p1",
        "p3",
        "",
        "",
        "p4",
        "",
        "",
        "",
        "p2",
        "",
        "",
        "",
      ]);
      expect(pages.some((page) => "tagId" in page)).toBe(false);
    } finally {
      await upgraded.delete();
    }
  });

  it("turns sections of named pages from version 10 of the database into slots and cuts", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(10).stores({ ...OLD_STORES, thumbnails: "pageId, notebookId" });
    await old.table("notebooks").add({
      id: "nb",
      lastOpenedAt: 1,
      cover: DEFAULT_COVER,
      themeId: "ruled",
      defaults: { showPageNumber: false, margin: 25, divider: 70 },
      lastPageId: "w1",
      sections: [
        { id: "s1", name: "Notes", color: "#111", lastPageId: "n2" },
        { id: "s2", name: "Work", color: "#222", lastPageId: "gone" },
      ],
    });
    const page = (id: string, createdAt: number, sectionId: string, text = "") => ({
      id,
      notebookId: "nb",
      createdAt,
      kind: "lined",
      sectionId,
      showPageNumber: true,
      margin: 20,
      columns: [columnFromText(text)],
      divider: null,
      drawing: [],
      drawingLayer: "over",
      canvasView: null,
    });
    // Creation order mixes the sections: Notes has n1, n2, n3; Work has w1 to w6.
    const before = [
      page("n1", 1, "s1", "one"),
      page("w1", 2, "s2"),
      page("n2", 3, "s1"),
      page("w2", 4, "s2", "two"),
      page("w3", 5, "s2"),
      page("n3", 6, "s1"),
      page("w4", 7, "s2"),
      page("w5", 8, "s2"),
      page("w6", 9, "s2"),
    ];
    await old.table("pages").bulkAdd(before);
    // A page of another notebook, which is gone, is left alone.
    await old.table("pages").add({ ...page("orphan", 1, "s1"), notebookId: "other" });
    old.close();
    const upgraded = new TypestillDb(name);
    try {
      const notebook = (await upgraded.notebooks.get("nb"))!;
      expect(notebook.size).toBe(64);
      expect(notebook.sections).toEqual([
        { id: "s1", name: "Notes", color: "#111", start: 0, lastPageId: "n2" },
        { id: "s2", name: "Work", color: "#222", start: 4, lastPageId: null },
      ]);
      expect(notebook.lastPageId).toBe("w1");
      const pages = await listPages(upgraded, "nb");
      expect(pages).toHaveLength(64);
      expect(pages.map((page) => page.position)).toEqual([...Array(64).keys()]);
      expect(pages.slice(0, 12).map((page) => (page.id.length > 2 ? "blank" : page.id))).toEqual([
        "n1",
        "n2",
        "n3",
        "blank",
        "w1",
        "w2",
        "w3",
        "w4",
        "w5",
        "w6",
        "blank",
        "blank",
      ]);
      expect(pages.map((page) => page.fill).slice(0, 12)).toEqual([
        0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0,
      ]);
      expect(pages.some((page) => "sectionId" in page)).toBe(false);
      expect(pages[0]).toEqual({
        ...page("n1", 1, "s1", "one"),
        sectionId: undefined,
        position: 0,
        fill: 0.5,
      });
      expect(Object.keys(pages[0])).not.toContain("sectionId");
      // The blank pages come from the notebook defaults, after every existing page.
      expect(pages[3].columns).toEqual([columnFromText(""), columnFromText("")]);
      expect(pages[3].divider).toBe(70);
      expect(pages[3].margin).toBe(25);
      expect(pages[3].showPageNumber).toBe(false);
      expect(pages[3].createdAt).toBeGreaterThan(9);
      expect(pages[63].createdAt).toBeGreaterThan(pages[62].createdAt);
      expect(await upgraded.pages.get("orphan")).toMatchObject({ sectionId: "s1" });
      expect(await upgraded.pages.count()).toBe(65);
    } finally {
      await upgraded.delete();
    }
  });

  it("upgrades plain-text columns from version 1 of the database", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores(OLD_STORES);
    await old.table("notebooks").add({ id: "nb", lastOpenedAt: 1 });
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
      expect(page?.position).toBe(0);
    } finally {
      await upgraded.delete();
    }
  });
});

describe("thumbnails", () => {
  it("caches thumbnails by page and drops them with the notebook", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const second = (await listPages(db, notebook.id))[1];
    await saveThumbnail(db, notebook.id, firstPage.id, "data:image/png;base64,AAAA");
    await saveThumbnail(db, notebook.id, second.id, "data:image/png;base64,BBBB");
    await saveThumbnail(db, notebook.id, second.id, "data:image/png;base64,CCCC");
    expect(await loadThumbnails(db, notebook.id)).toEqual({
      [firstPage.id]: "data:image/png;base64,AAAA",
      [second.id]: "data:image/png;base64,CCCC",
    });
    await deleteNotebook(db, notebook.id);
    expect(await db.thumbnails.count()).toBe(0);
  });
});

describe("sections", () => {
  const sectionsOf = async (notebookId: string) => (await db.notebooks.get(notebookId))!.sections;

  it("cuts sections at sheet boundaries, in start order, and updates them", async () => {
    const { notebook } = await createNotebook(db, { name: "A", size: 64 });
    const [notes] = notebook.sections;
    const ideas = await cutSection(db, notebook.id, 40, { name: " Ideas ", color: "#b8342c" });
    expect(ideas).toEqual({
      id: ideas.id,
      name: "Ideas",
      color: "#b8342c",
      start: 40,
      lastPageId: null,
    });
    const quotes = await cutSection(db, notebook.id, 8, { name: "Quotes", color: "#2f5b9e" });
    expect(await sectionsOf(notebook.id)).toEqual([notes, quotes, ideas]);
    await updateSection(db, notebook.id, ideas.id, { name: "Plans", color: "#2e7d4f" });
    expect((await sectionsOf(notebook.id))[2]).toEqual({
      id: ideas.id,
      name: "Plans",
      color: "#2e7d4f",
      start: 40,
      lastPageId: null,
    });
    for (const start of [0, 6, 8, 64, 68, -4]) {
      await expect(
        cutSection(db, notebook.id, start, { name: "x", color: "#111" }),
      ).rejects.toThrow();
    }
    expect(await sectionsOf(notebook.id)).toHaveLength(3);
    expect(SHEET).toBe(4);
  });

  it("moves a cut by whole sheets between its neighbours", async () => {
    const { notebook } = await createNotebook(db, { name: "A", size: 64 });
    const [notes] = notebook.sections;
    const ideas = await cutSection(db, notebook.id, 8, { name: "Ideas", color: "#b8342c" });
    const quotes = await cutSection(db, notebook.id, 40, { name: "Quotes", color: "#2f5b9e" });
    const starts = async () => (await sectionsOf(notebook.id)).map((s) => s.start);
    await moveCut(db, notebook.id, ideas.id, 20);
    expect(await starts()).toEqual([0, 20, 40]);
    await moveCut(db, notebook.id, quotes.id, 60);
    expect(await starts()).toEqual([0, 20, 60]);
    await expect(moveCut(db, notebook.id, notes.id, 4)).rejects.toThrow(FirstSectionError);
    await expect(moveCut(db, notebook.id, ideas.id, 0)).rejects.toThrow(/cross/);
    await expect(moveCut(db, notebook.id, ideas.id, 60)).rejects.toThrow(/cross/);
    await expect(moveCut(db, notebook.id, ideas.id, 22)).rejects.toThrow(/multiple of 4/);
    await expect(moveCut(db, notebook.id, quotes.id, 64)).rejects.toThrow(/past the end/);
    await expect(moveCut(db, notebook.id, "missing", 4)).rejects.toThrow(/not found/);
    expect(await starts()).toEqual([0, 20, 60]);
  });

  it("removes a cut, its pages merging into the section before it", async () => {
    const { notebook } = await createNotebook(db, { name: "A", size: 64 });
    const [notes] = notebook.sections;
    const ideas = await cutSection(db, notebook.id, 8, { name: "Ideas", color: "#b8342c" });
    const quotes = await cutSection(db, notebook.id, 40, { name: "Quotes", color: "#2f5b9e" });
    expect(await removeCut(db, notebook.id, quotes.id)).toEqual({ mergedInto: ideas, count: 24 });
    expect(await sectionsOf(notebook.id)).toEqual([notes, ideas]);
    expect(await removeCut(db, notebook.id, ideas.id)).toEqual({ mergedInto: notes, count: 56 });
    expect(await sectionsOf(notebook.id)).toEqual([notes]);
    await expect(removeCut(db, notebook.id, notes.id)).rejects.toThrow(FirstSectionError);
    await expect(removeCut(db, notebook.id, "missing")).rejects.toThrow(/not found/);
    expect(await sectionsOf(notebook.id)).toEqual([notes]);
    expect(await db.pages.count()).toBe(64);
  });

  it("remembers where each section was left", async () => {
    const { notebook, firstPage } = await createNotebook(db, { name: "A" });
    const [notes] = notebook.sections;
    const ideas = await cutSection(db, notebook.id, 8, { name: "Ideas", color: "#b8342c" });
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
    const second = (await listPages(db, notebook.id))[1];
    const page = await setPageKind(db, second.id, "zine");
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
    const { notebook, firstPage } = await createNotebook(db, { name: "A", size: 64 });
    await savePageText(db, firstPage.id, [columnFromText("some text")], 0.1);
    await savePageDrawing(db, firstPage.id, [element("a")], {});
    await saveCanvasContent(db, notebook.id, [imageElement("img", "f1")], { f1: fileData("f1") });
    const doc = await exportNotebook(db, notebook.id);
    expect(doc?.size).toBe(64);
    expect(doc?.pages).toHaveLength(64);
    expect(doc?.pages[0].drawing).toEqual([element("a")]);
    expect(doc?.pages[0].fill).toBe(0.1);
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
