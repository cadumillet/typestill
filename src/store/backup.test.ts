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
import { fileData } from "./fixtures";
import type { NotebookDocument } from "./model";

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
  defaults: { showDate: true, showPageNumber: true, margin: 20, divider: null },
  tags: [],
  pages: [
    {
      id: "p1",
      notebookId: "nb1",
      createdAt: 10,
      kind: "lined",
      tagId: null,
      showDate: true,
      showPageNumber: true,
      margin: 20,
      columns: [{ text: "hello \nworld", doc: formatted }, columnFromText("world")],
      divider: 70,
      canvasView: { scrollX: 0, scrollY: 0, zoom: 1 },
    },
    {
      id: "p2",
      notebookId: "nb1",
      createdAt: 11,
      kind: "zine",
      tagId: null,
      showDate: true,
      showPageNumber: true,
      margin: 20,
      columns: [],
      zine: {
        padding: 0,
        media: { layout: "row", images: [{ fileId: "f1", fit: "cover" }, null] },
        textBelow: columnFromText("caption"),
        textBeside: null,
        textSide: "right",
        textRows: 4,
      },
      divider: null,
      canvasView: null,
    },
  ],
  canvas: { notebookId: "nb1", gridEnabled: false, elements: [] },
  files: { f1: fileData("f1") },
};

describe("backup", () => {
  it("round-trips through JSON", () => {
    const text = serializeBackup(doc);
    expect(JSON.parse(text).version).toBe(BACKUP_VERSION);
    expect(parseBackup(text)).toEqual(doc);
  });

  it("reads version 1, turning each line break into a paragraph boundary", () => {
    const raw = JSON.parse(serializeBackup(doc));
    raw.version = 1;
    raw.notebook.pages.pop();
    raw.notebook.pages[0].columns = ["one\ntwo\n\nfour", ""];
    const parsed = parseBackup(JSON.stringify(raw));
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
      const raw = JSON.parse(serializeBackup(doc));
      raw.notebook.pages[0].columns = columns;
      expect(() => parseBackup(JSON.stringify(raw))).toThrow(/columns/);
    }
  });

  it("reads pages without a kind as lined, and checks zine pages", () => {
    const raw = JSON.parse(serializeBackup(doc));
    raw.version = 3;
    raw.notebook.pages.pop();
    delete raw.notebook.pages[0].kind;
    expect(parseBackup(JSON.stringify(raw)).pages[0].kind).toBe("lined");

    const badKind = JSON.parse(serializeBackup(doc));
    badKind.notebook.pages[0].kind = "sketch";
    expect(() => parseBackup(JSON.stringify(badKind))).toThrow(/kind/);

    const withColumns = JSON.parse(serializeBackup(doc));
    withColumns.notebook.pages[1].columns = [columnFromText("x")];
    expect(() => parseBackup(JSON.stringify(withColumns))).toThrow(/columns/);

    for (const zine of [
      undefined,
      null,
      { ...doc.pages[1].zine, media: { layout: "row", images: [null] } },
      { ...doc.pages[1].zine, media: { layout: "grid", images: [null] } },
      { ...doc.pages[1].zine, textRows: 0 },
      { ...doc.pages[1].zine, textBelow: "caption" },
    ]) {
      const bad = JSON.parse(serializeBackup(doc));
      bad.notebook.pages[1].zine = zine;
      expect(() => parseBackup(JSON.stringify(bad))).toThrow(/zine/);
    }
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
    const bad = JSON.parse(serializeBackup(doc));
    bad.notebook.pageSize = "A3";
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/page size/);
    const badPage = JSON.parse(serializeBackup(doc));
    badPage.notebook.pages[0].columns = [
      columnFromText("a"),
      columnFromText("b"),
      columnFromText("c"),
    ];
    expect(() => parseBackup(JSON.stringify(badPage))).toThrow(/columns/);
    const badCanvas = JSON.parse(serializeBackup(doc));
    badCanvas.notebook.canvas = null;
    expect(() => parseBackup(JSON.stringify(badCanvas))).toThrow(/canvas/);
  });

  it("fills lastOpenedAt, the grid flag, margins and the cover when missing", () => {
    const raw = JSON.parse(serializeBackup(doc));
    raw.version = 2;
    delete raw.notebook.lastOpenedAt;
    delete raw.notebook.lastPageId;
    delete raw.notebook.canvas.gridEnabled;
    delete raw.notebook.defaults.margin;
    delete raw.notebook.pages[0].margin;
    delete raw.notebook.cover;
    delete raw.notebook.themeId;
    const parsed = parseBackup(JSON.stringify(raw));
    expect(parsed.lastOpenedAt).toBe(10);
    expect(parsed.lastPageId).toBeNull();
    expect(parsed.canvas.gridEnabled).toBe(true);
    expect(parsed.defaults.margin).toBe(20);
    expect(parsed.pages[0].margin).toBe(20);
    expect(parsed.cover).toEqual(DEFAULT_COVER);
    expect(parsed.themeId).toBe("ruled");
    const bad = JSON.parse(serializeBackup(doc));
    bad.notebook.themeId = "";
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/theme/);
  });

  it("rejects a malformed cover", () => {
    for (const cover of [null, "red", { color: "" }, { color: "#fff", emoji: 3, subtitle: null }]) {
      const raw = JSON.parse(serializeBackup(doc));
      raw.notebook.cover = cover;
      expect(() => parseBackup(JSON.stringify(raw))).toThrow(/cover/);
    }
  });
});
