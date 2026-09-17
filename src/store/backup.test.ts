import { describe, expect, it } from "vitest";
import { BackupError, backupFileName, parseBackup, serializeBackup } from "./backup";
import { fileData } from "./fixtures";
import type { NotebookDocument } from "./model";

const doc: NotebookDocument = {
  id: "nb1",
  name: "Field notes",
  createdAt: 10,
  lastOpenedAt: 20,
  pageSize: "A5",
  orientation: "portrait",
  defaults: { showDate: true, showPageNumber: true, margin: 20, divider: null },
  tags: [],
  pages: [
    {
      id: "p1",
      notebookId: "nb1",
      createdAt: 10,
      tagId: null,
      showDate: true,
      showPageNumber: true,
      margin: 20,
      columns: ["hello", "world"],
      divider: 70,
      canvasView: { scrollX: 0, scrollY: 0, zoom: 1 },
    },
  ],
  canvas: { notebookId: "nb1", gridEnabled: false, elements: [] },
  files: { f1: fileData("f1") },
};

describe("backup", () => {
  it("round-trips through JSON", () => {
    expect(parseBackup(serializeBackup(doc))).toEqual(doc);
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
    badPage.notebook.pages[0].columns = ["a", "b", "c"];
    expect(() => parseBackup(JSON.stringify(badPage))).toThrow(/columns/);
    const badCanvas = JSON.parse(serializeBackup(doc));
    badCanvas.notebook.canvas = null;
    expect(() => parseBackup(JSON.stringify(badCanvas))).toThrow(/canvas/);
  });

  it("fills lastOpenedAt, the grid flag and margins when missing", () => {
    const raw = JSON.parse(serializeBackup(doc));
    delete raw.notebook.lastOpenedAt;
    delete raw.notebook.canvas.gridEnabled;
    delete raw.notebook.defaults.margin;
    delete raw.notebook.pages[0].margin;
    const parsed = parseBackup(JSON.stringify(raw));
    expect(parsed.lastOpenedAt).toBe(10);
    expect(parsed.canvas.gridEnabled).toBe(true);
    expect(parsed.defaults.margin).toBe(20);
    expect(parsed.pages[0].margin).toBe(20);
  });
});
