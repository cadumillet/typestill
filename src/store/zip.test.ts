import { describe, expect, it } from "vitest";
import { columnFromText } from "../page/document";
import { fileData } from "./fixtures";
import type { NotebookDocument } from "./model";
import {
  bytesOfDataUrl,
  dataUrlBytes,
  formatBytes,
  isZipBackup,
  notebookSize,
  packBackupZip,
  unpackBackupZip,
  zipBackupFileName,
} from "./zip";

const png = "data:image/png;base64," + btoa("\x89PNG\r\n\x1a\nnot really a png");

const doc: NotebookDocument = {
  id: "nb1",
  name: "Field notes",
  createdAt: 10,
  lastOpenedAt: 20,
  lastPageId: "p1",
  cover: { color: "#2f5b9e", emoji: null, subtitle: null },
  themeId: "ruled",
  pageSize: "A5",
  orientation: "portrait",
  defaults: { showPageNumber: true, margin: 20, divider: null },
  tags: [],
  pages: [
    {
      id: "p1",
      notebookId: "nb1",
      createdAt: 10,
      kind: "lined",
      tagId: null,
      showPageNumber: true,
      margin: 20,
      columns: [columnFromText("hello")],
      divider: null,
      clippings: [],
      canvasView: null,
    },
  ],
  canvas: { notebookId: "nb1", gridEnabled: true, elements: [] },
  files: {
    f1: { ...fileData("f1"), dataURL: png as never },
    f2: {
      ...fileData("f2"),
      mimeType: "image/jpeg",
      dataURL: "data:image/jpeg;base64,/9j/4AAQ" as never,
    },
  },
};

describe("zip backup", () => {
  it("round-trips a notebook with its images as files", () => {
    const zip = packBackupZip(doc, 123);
    const back = unpackBackupZip(zip);
    expect(back).toEqual(doc);
  });

  it("rejects zips that are not backups", () => {
    expect(() => unpackBackupZip(new Uint8Array([1, 2, 3]))).toThrow(/zip/);
  });

  it("decodes data URLs", () => {
    expect([...bytesOfDataUrl("data:text/plain;base64,YWJj")]).toEqual([97, 98, 99]);
    expect(dataUrlBytes("data:text/plain;base64,YWJj")).toBe(3);
    expect(dataUrlBytes("data:text/plain;base64,YQ==")).toBe(1);
  });

  it("measures a notebook and formats sizes", () => {
    const size = notebookSize(doc);
    expect(size.imageCount).toBe(2);
    expect(size.images).toBe(dataUrlBytes(png) + dataUrlBytes("data:image/jpeg;base64,/9j/4AAQ"));
    expect(size.total).toBeGreaterThan(size.images);
    expect(formatBytes(12)).toBe("12 bytes");
    expect(formatBytes(340_000)).toBe("340 kB");
    expect(formatBytes(1_234_567)).toBe("1.2 MB");
  });

  it("names and recognises zip backups", () => {
    expect(zipBackupFileName(doc, new Date("2026-09-18T10:00:00Z"))).toBe(
      "field-notes-2026-09-18.typestill.zip",
    );
    expect(isZipBackup({ name: "x.typestill.zip", type: "" })).toBe(true);
    expect(isZipBackup({ name: "x.json", type: "application/json" })).toBe(false);
  });
});
