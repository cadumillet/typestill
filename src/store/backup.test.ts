import { describe, expect, it } from "vitest";
import { DEFAULT_COVER } from "../notebook/cover";
import { columnFromText, documentFromText, type EditorDocument } from "../page/document";
import {
  BACKUP_VERSION,
  BackupError,
  backupFileName,
  parseBackup,
  serializeBackup,
} from "./backup";
import { element, fileData, imageElement, linedPage, section } from "./fixtures";
import { isPageBlank, type NotebookDocument, type Page } from "./model";

const formatted: EditorDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { align: "center" },
      content: [
        { type: "text", text: "hello ", marks: [{ type: "bold" }] },
        { type: "hard_break" },
        { type: "text", text: "world", marks: [{ type: "color", attrs: { color: "#e03131" } }] },
        { type: "text", text: "!", marks: [{ type: "highlight", attrs: { tint: "yellow" } }] },
      ],
    },
  ],
};

const doc: NotebookDocument = {
  id: "nb1",
  name: "Field notes",
  createdAt: 10,
  lastOpenedAt: 20,
  lastPageId: "p1",
  cover: { color: "#2f5b9e", emoji: "🧭", subtitle: "Field notes, spring" },
  themeId: "plain",
  pageSize: "A5",
  orientation: "portrait",
  defaults: { showPageNumber: true, margin: 20, divider: null },
  size: 8,
  sections: [section("s1", { lastPageId: "p1" }), section("s2", { color: "#b8342c", start: 4 })],
  // Two sheets: a written page and a zine page open each section, blank pages fill the rest.
  pages: [
    {
      id: "p1",
      notebookId: "nb1",
      createdAt: 10,
      position: 0,
      kind: "lined",
      fill: 0.4,
      showPageNumber: true,
      margin: 20,
      columns: [{ text: "hello \nworld!", doc: formatted }, columnFromText("world")],
      divider: 70,
      drawing: [element("r1"), imageElement("img", "f1")],
      drawingLayer: "under",
      canvasView: { scrollX: 0, scrollY: 0, zoom: 1 },
    },
    ...[1, 2, 3].map((position) =>
      linedPage(`p${position + 1}`, position, { notebookId: "nb1", createdAt: 10 + position }),
    ),
    {
      id: "p5",
      notebookId: "nb1",
      createdAt: 14,
      position: 4,
      kind: "zine",
      fill: 1,
      showPageNumber: true,
      margin: 20,
      columns: [],
      zine: {
        padding: 0,
        rows: [
          {
            blocks: [
              { kind: "grid", layout: "row", images: [{ fileId: "f1", fit: "cover" }, null] },
            ],
          },
          { blocks: [{ kind: "text", column: columnFromText("caption"), rows: 4 }] },
        ],
      },
      divider: null,
      drawing: [],
      drawingLayer: "over",
      canvasView: null,
    },
    ...[5, 6, 7].map((position) =>
      linedPage(`p${position + 1}`, position, { notebookId: "nb1", createdAt: 10 + position }),
    ),
  ],
  canvas: { notebookId: "nb1", gridEnabled: false, elements: [] },
  files: { f1: fileData("f1") },
};

/** A zine page as versions 4 and 5 stored it. */
const legacyZine = {
  padding: 6,
  media: { layout: "single", images: [{ fileId: "f1", fit: "contain" }] },
  textBelow: columnFromText("caption"),
  textBeside: columnFromText("beside"),
  textSide: "left",
  textRows: 3,
};

type Raw = {
  version: number;
  notebook: Record<string, unknown> & { pages: Record<string, unknown>[] };
};

/** The fixture as a file at the current version, as JSON.parse types it, to bend into an older shape. */
const raw = () => JSON.parse(serializeBackup(doc));

/** The document as a file from before version 8 holds it: no drawing fields. */
function withoutDrawings<T extends Raw>(raw: T): T {
  for (const page of raw.notebook.pages) {
    delete page.drawing;
    delete page.drawingLayer;
  }
  return raw;
}

/**
 * The document as a version 9 file holds it: no size, sections without a start, and each
 * page naming its section (the one its position falls in) instead of holding its slot.
 */
function asVersion9<T extends Raw>(raw: T): T {
  delete raw.notebook.size;
  for (const section of raw.notebook.sections as Record<string, unknown>[]) delete section.start;
  for (const page of raw.notebook.pages) {
    page.sectionId = (page.position as number) < 4 ? "s1" : "s2";
    delete page.position;
    delete page.fill;
  }
  raw.version = 9;
  return raw;
}

/**
 * The document as a file from before version 9 holds it: tags in place of sections, and
 * each page carrying the tag `tagOf` gives it (none by default).
 */
function withTags<T extends Raw>(
  raw: T,
  tags: { id: string; name: string; color: string }[] = [],
  tagOf: (page: Record<string, unknown>) => string | null = () => null,
): T {
  asVersion9(raw);
  delete raw.notebook.sections;
  raw.notebook.tags = tags;
  for (const page of raw.notebook.pages) {
    delete page.sectionId;
    page.tagId = tagOf(page);
  }
  raw.version = 8;
  return raw;
}

/** The pages as they parse from a file without drawings. */
const undrawn: Page[] = doc.pages.map((page) => ({ ...page, drawing: [], drawingLayer: "over" }));

/** The document less its pages, sections and size: what every version parses alike. */
function meta(document: NotebookDocument): Partial<NotebookDocument> {
  const { id, name, createdAt, lastOpenedAt, lastPageId, cover, themeId } = document;
  const { pageSize, orientation, defaults, canvas, files } = document;
  return {
    id,
    name,
    createdAt,
    lastOpenedAt,
    lastPageId,
    cover,
    themeId,
    pageSize,
    orientation,
    defaults,
    canvas,
    files,
  };
}

/**
 * Checks what a document parses to from a file without tags: one section, Notes, in the
 * cover's colour, every page in it in order, as slots shaded by what they hold, then
 * blank slots up to the smallest size, 64.
 */
function expectInNotes(parsed: NotebookDocument, expected: readonly Page[]): void {
  const [notes] = parsed.sections;
  expect(parsed.sections).toEqual([
    { id: notes.id, name: "Notes", color: doc.cover.color, start: 0, lastPageId: null },
  ]);
  expect(parsed.size).toBe(64);
  expect(parsed.pages).toHaveLength(64);
  expect(parsed.pages.slice(0, expected.length)).toEqual(
    expected.map((page, position) => ({
      ...page,
      position,
      fill: isPageBlank(page) ? 0 : 0.5,
    })),
  );
  expect(parsed.pages.slice(expected.length).every((page) => isPageBlank(page))).toBe(true);
}

describe("backup", () => {
  it("round-trips through JSON at version 10, size, cuts, slots and drawings included", () => {
    expect(BACKUP_VERSION).toBe(10);
    const text = serializeBackup(doc);
    expect(JSON.parse(text).version).toBe(BACKUP_VERSION);
    expect(parseBackup(text)).toEqual(doc);
  });

  it("checks the size, the cuts and the slots of version 10 files", () => {
    for (const size of [undefined, 0, 6, -4, "8"]) {
      const bad = raw();
      bad.notebook.size = size;
      expect(() => parseBackup(JSON.stringify(bad))).toThrow(/Invalid size/);
    }
    const short = raw();
    short.notebook.pages.pop();
    expect(() => parseBackup(JSON.stringify(short))).toThrow(/Page count/);
    const long = raw();
    long.notebook.size = 12;
    expect(() => parseBackup(JSON.stringify(long))).toThrow(/Page count/);
    const twice = raw();
    twice.notebook.pages[3].position = 2;
    expect(() => parseBackup(JSON.stringify(twice))).toThrow(/share a position/);
    for (const position of [undefined, -1, 8, 1.5, "1"]) {
      const bad = raw();
      bad.notebook.pages[1].position = position;
      expect(() => parseBackup(JSON.stringify(bad))).toThrow(/invalid position/);
    }
    for (const fill of [undefined, -0.1, 1.5, "0"]) {
      const bad = raw();
      bad.notebook.pages[1].fill = fill;
      expect(() => parseBackup(JSON.stringify(bad))).toThrow(/invalid fill/);
    }
    const named = raw();
    named.notebook.pages[1].sectionId = "s1";
    expect(() => parseBackup(JSON.stringify(named))).toThrow(/names a section/);

    for (const sections of [
      undefined,
      [],
      [{ id: "s1", name: "A", color: "#111", lastPageId: null }],
      [{ id: "s1", name: "A", color: "#111", start: "0", lastPageId: null }],
    ]) {
      const bad = raw();
      bad.notebook.sections = sections;
      expect(() => parseBackup(JSON.stringify(bad))).toThrow(/Invalid sections/);
    }
    const offSheet = raw();
    offSheet.notebook.sections[1].start = 6;
    expect(() => parseBackup(JSON.stringify(offSheet))).toThrow(
      /Invalid sections: .*multiple of 4/,
    );
    const late = raw();
    late.notebook.sections[0].start = 4;
    expect(() => parseBackup(JSON.stringify(late))).toThrow(/Invalid sections: .*start at 0/);
    const past = raw();
    past.notebook.sections[1].start = 8;
    expect(() => parseBackup(JSON.stringify(past))).toThrow(/Invalid sections: .*past the end/);

    // A section left at a page the file no longer holds is unvisited.
    const left = raw();
    left.notebook.sections[1].lastPageId = "gone";
    const parsed = parseBackup(JSON.stringify(left));
    expect(parsed.sections.map((section) => section.lastPageId)).toEqual(["p1", null]);
  });

  it("reads version 9 files, padding each section to whole sheets and picking the size", () => {
    // Three pages in s1 and two in s2, in a creation order that mixes them.
    const file = asVersion9(raw());
    file.notebook.pages = [
      file.notebook.pages[0],
      file.notebook.pages[4],
      file.notebook.pages[1],
      file.notebook.pages[5],
      file.notebook.pages[2],
    ];
    file.notebook.sections[1].lastPageId = "p6";
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed).toMatchObject(meta(doc));
    expect(parsed.size).toBe(64);
    expect(parsed.sections).toEqual([
      { ...doc.sections[0], start: 0 },
      { ...doc.sections[1], start: 4, lastPageId: "p6" },
    ]);
    expect(parsed.pages).toHaveLength(64);
    expect(parsed.pages.map((page) => page.position)).toEqual([...Array(64).keys()]);
    expect(
      parsed.pages.slice(0, 8).map((page) => (page.id.length > 2 ? "blank" : page.id)),
    ).toEqual(["p1", "p2", "p3", "blank", "p5", "p6", "blank", "blank"]);
    expect(parsed.pages[0]).toEqual({ ...doc.pages[0], fill: 0.5 });
    expect(parsed.pages[1]).toEqual({ ...doc.pages[1], fill: 0 });
    expect(parsed.pages[4]).toEqual({ ...doc.pages[4], fill: 0.5 });
    expect(parsed.pages.some((page) => "sectionId" in page)).toBe(false);
    // The padding is blank lined pages from the notebook defaults, made after the last page.
    expect(parsed.pages[3]).toMatchObject({
      notebookId: "nb1",
      position: 3,
      kind: "lined",
      fill: 0,
      columns: [columnFromText("")],
      divider: null,
      margin: 20,
    });
    expect(parsed.pages[3].createdAt).toBeGreaterThan(15);
    expect(parsed.pages.slice(6).every((page) => isPageBlank(page))).toBe(true);

    const unknown = asVersion9(raw());
    unknown.notebook.pages[1].sectionId = "s9";
    expect(() => parseBackup(JSON.stringify(unknown))).toThrow(/invalid section/);
    const missing = asVersion9(raw());
    delete missing.notebook.pages[1].sectionId;
    expect(() => parseBackup(JSON.stringify(missing))).toThrow(/invalid section/);
    for (const sections of [undefined, [], [{ id: "s1", name: "A", color: "#111" }]]) {
      const bad = asVersion9(raw());
      bad.notebook.sections = sections;
      expect(() => parseBackup(JSON.stringify(bad))).toThrow(/Invalid sections/);
    }
  });

  it("reads version 8 files, turning tags into sections with the untagged pages in Notes", () => {
    const tags = [
      { id: "t1", name: "Ideas", color: "#b8342c" },
      { id: "t2", name: "Quotes", color: "#6a4c9c" },
    ];
    const file = withTags(raw(), tags, (page) => (page.id === "p5" ? "t2" : null));
    file.notebook.pages.push({ ...file.notebook.pages[0], id: "p9", createdAt: 20, tagId: "gone" });
    // The oldest files have no tag field at all.
    delete file.notebook.pages[0].tagId;
    const parsed = parseBackup(JSON.stringify(file));
    const [notes, ideas, quotes] = parsed.sections;
    expect(parsed.sections).toHaveLength(3);
    expect(notes).toEqual({
      id: notes.id,
      name: "Notes",
      color: "#2f5b9e",
      start: 0,
      lastPageId: null,
    });
    // Ideas has no pages and gets one blank sheet; Quotes has the zine page.
    expect(ideas).toEqual({
      id: "t1",
      name: "Ideas",
      color: "#b8342c",
      start: 8,
      lastPageId: null,
    });
    expect(quotes).toEqual({
      id: "t2",
      name: "Quotes",
      color: "#6a4c9c",
      start: 12,
      lastPageId: null,
    });
    expect(parsed.size).toBe(64);
    expect(
      parsed.pages.slice(0, 16).map((page) => (page.id.length > 2 ? "blank" : page.id)),
    ).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p6",
      "p7",
      "p8",
      "p9",
      "blank",
      "blank",
      "blank",
      "blank",
      "p5",
      "blank",
      "blank",
      "blank",
    ]);
    expect("tags" in parsed).toBe(false);
    expect(parsed.pages.some((page) => "tagId" in page)).toBe(false);
    expect(parsed.pages.some((page) => "sectionId" in page)).toBe(false);

    const badTag = withTags(raw(), [], () => 3 as never);
    expect(() => parseBackup(JSON.stringify(badTag))).toThrow(/invalid tag/);
    const badTags = withTags(raw(), [{ id: "t1" } as never]);
    expect(() => parseBackup(JSON.stringify(badTags))).toThrow(/Invalid tags/);
  });

  it("reads version 7 files, giving pages an empty drawing over the text", () => {
    const file = withTags(withoutDrawings(raw()));
    file.version = 7;
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed).toMatchObject(meta(doc));
    expectInNotes(parsed, undrawn);
  });

  it("checks the drawing fields of version 8 files", () => {
    const missing = withTags(withoutDrawings(raw()));
    expect(() => parseBackup(JSON.stringify(missing))).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify(missing))).toThrow(/drawing/);

    const notArray = raw();
    notArray.notebook.pages[0].drawing = { elements: [] };
    expect(() => parseBackup(JSON.stringify(notArray))).toThrow(/invalid drawing$/);

    const sideways = raw();
    sideways.notebook.pages[0].drawingLayer = "sideways";
    expect(() => parseBackup(JSON.stringify(sideways))).toThrow(/drawing layer/);
  });

  it("reads version 1, turning each line break into a paragraph boundary", () => {
    const file = withTags(raw());
    file.version = 1;
    file.notebook.pages.length = 1;
    file.notebook.pages[0].columns = ["one\ntwo\n\nfour", ""];
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.pages[0].columns).toEqual([
      { text: "one\ntwo\n\nfour", doc: documentFromText("one\ntwo\n\nfour") },
      columnFromText(""),
    ]);
    expect(parsed.pages[0].columns[0].doc.content.map((p) => p.content?.[0].type)).toEqual([
      "text",
      "text",
      undefined,
      "text",
    ]);
    expect(parsed.size).toBe(64);
  });

  it("rejects version 2 columns that are not documents", () => {
    for (const columns of [
      ["plain"],
      [{ text: "x" }],
      [{ text: "x", doc: { type: "doc", content: [] } }],
      [
        {
          text: "x",
          doc: { type: "doc", content: [{ type: "heading", attrs: { align: "left" } }] },
        },
      ],
      [
        {
          text: "x",
          doc: { type: "doc", content: [{ type: "paragraph", attrs: { align: "top" } }] },
        },
      ],
      [
        {
          text: "x",
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                attrs: { align: "left" },
                content: [{ type: "text", text: "x", marks: [{ type: "link" }] }],
              },
            ],
          },
        },
      ],
    ]) {
      const file = raw();
      file.notebook.pages[0].columns = columns;
      expect(() => parseBackup(JSON.stringify(file))).toThrow(/columns/);
    }
  });

  it("reads pages without a kind as lined, and checks zine pages", () => {
    const file = withTags(raw());
    file.version = 3;
    file.notebook.pages.length = 1;
    delete file.notebook.pages[0].kind;
    expect(parseBackup(JSON.stringify(file)).pages[0].kind).toBe("lined");

    const badKind = raw();
    badKind.notebook.pages[0].kind = "sketch";
    expect(() => parseBackup(JSON.stringify(badKind))).toThrow(/kind/);

    const withColumns = raw();
    withColumns.notebook.pages[4].columns = [columnFromText("x")];
    expect(() => parseBackup(JSON.stringify(withColumns))).toThrow(/columns/);

    for (const zine of [
      undefined,
      null,
      { padding: 0, rows: [{ blocks: [{ kind: "grid", layout: "row", images: [null] }] }] },
      { padding: 0, rows: [{ blocks: [{ kind: "text", column: "caption", rows: 4 }] }] },
      { padding: 0, rows: [{ blocks: [] }] },
      // The old shape is version 5's, not version 6's.
      legacyZine,
    ]) {
      const bad = raw();
      bad.notebook.pages[4].zine = zine;
      expect(() => parseBackup(JSON.stringify(bad))).toThrow(/zine/);
    }
  });

  it("converts version 5 zine pages to rows of blocks and drops the date stamp fields", () => {
    const file = withTags(raw());
    file.version = 5;
    file.notebook.defaults.showDate = true;
    file.notebook.pages[0].showDate = false;
    file.notebook.pages[4].showDate = true;
    file.notebook.pages[4].zine = legacyZine;
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.defaults).toEqual(doc.defaults);
    expect("showDate" in parsed.pages[0]).toBe(false);
    expect(parsed.pages[4].zine).toEqual({
      padding: 6,
      rows: [
        {
          blocks: [
            { kind: "text", column: columnFromText("beside"), rows: 3 },
            { kind: "image", image: { fileId: "f1", fit: "contain" } },
          ],
        },
        { blocks: [{ kind: "text", column: columnFromText("caption"), rows: 3 }] },
      ],
    });
    // A version-5 zine page must have the old shape; the new one is refused there.
    const mixed = withTags(raw());
    mixed.version = 5;
    expect(() => parseBackup(JSON.stringify(mixed))).toThrow(/zine/);
  });

  it("reads version 6 files as they are, and refuses an unknown highlight tint", () => {
    const file = withTags(withoutDrawings(raw()));
    file.version = 6;
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed).toMatchObject(meta(doc));
    expectInNotes(parsed, undrawn);

    const tinted = raw();
    tinted.notebook.pages[0].columns[0].doc.content[0].content[3].marks[0].attrs.tint = "orange";
    expect(() => parseBackup(JSON.stringify(tinted))).toThrow(/columns/);
  });

  it("names the file after the notebook and the date", () => {
    expect(backupFileName(doc, new Date("2026-09-17T10:00:00Z"))).toBe(
      "field-notes-2026-09-17.typestill.json",
    );
    expect(backupFileName({ name: "!!!" }, new Date("2026-09-17T10:00:00Z"))).toBe(
      "notebook-2026-09-17.typestill.json",
    );
  });

  it("rejects files that are not backups", () => {
    expect(() => parseBackup("not json")).toThrow(BackupError);
    expect(() => parseBackup('{"format":"other"}')).toThrow(/Not a typestill backup/);
    expect(() =>
      parseBackup(JSON.stringify({ format: "typestill-notebook", version: 99 })),
    ).toThrow(/version 99/);
  });

  it("rejects a notebook with bad fields", () => {
    const bad = raw();
    bad.notebook.pageSize = "A3";
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/page size/);
    const badPage = raw();
    badPage.notebook.pages[0].columns = [
      columnFromText("a"),
      columnFromText("b"),
      columnFromText("c"),
    ];
    expect(() => parseBackup(JSON.stringify(badPage))).toThrow(/columns/);
    const badCanvas = raw();
    badCanvas.notebook.canvas = null;
    expect(() => parseBackup(JSON.stringify(badCanvas))).toThrow(/canvas/);
  });

  it("fills lastOpenedAt, the grid flag, margins and the cover when missing", () => {
    const file = withTags(raw());
    file.version = 2;
    file.notebook.pages.length = 1;
    delete file.notebook.lastOpenedAt;
    delete file.notebook.lastPageId;
    delete file.notebook.canvas.gridEnabled;
    delete file.notebook.defaults.margin;
    delete file.notebook.pages[0].margin;
    delete file.notebook.cover;
    delete file.notebook.themeId;
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.lastOpenedAt).toBe(10);
    expect(parsed.lastPageId).toBeNull();
    expect(parsed.canvas.gridEnabled).toBe(true);
    expect(parsed.defaults.margin).toBe(20);
    expect(parsed.pages[0].margin).toBe(20);
    // The blank pages take the margin as filled in too.
    expect(parsed.pages[1].margin).toBe(20);
    expect(parsed.cover).toEqual(DEFAULT_COVER);
    // Notes takes the colour of the cover as filled in.
    expect(parsed.sections[0].color).toBe(DEFAULT_COVER.color);
    expect(parsed.themeId).toBe("ruled");
    const bad = raw();
    bad.notebook.themeId = "";
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/theme/);
  });

  it("rejects a malformed cover", () => {
    for (const cover of [null, "red", { color: "" }, { color: "#fff", emoji: 3, subtitle: null }]) {
      const file = raw();
      file.notebook.cover = cover;
      expect(() => parseBackup(JSON.stringify(file))).toThrow(/cover/);
    }
  });
});
