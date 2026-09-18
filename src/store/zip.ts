// The zip backup: the same notebook JSON as the plain backup, with each image as its own
// file instead of a data URL inside the JSON. Meant for notebooks heavy with photos,
// where one JSON document with everything base64 inside gets unwieldy.
//
//   notebook.json          the backup envelope; each file entry keeps id, mimeType and
//                          created, with an empty dataURL
//   files/<id>.<ext>       the image bytes
//
// Both shapes are read by openBackup; the format version is the plain backup's.

import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { NotebookDocument } from "./model";
import { BackupError, parseBackup, serializeBackup } from "./backup";

const NOTEBOOK_ENTRY = "notebook.json";
const FILES_DIR = "files/";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

function extensionFor(mimeType: string): string {
  return EXTENSIONS[mimeType] ?? "bin";
}

/** The bytes a data URL encodes. */
export function bytesOfDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function dataUrlOf(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/** Bytes a data URL's payload takes once decoded. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const payload = dataUrl.length - comma - 1;
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload * 3) / 4) - padding);
}

/** Packs a notebook as a zip: notebook.json plus one file per image. */
export function packBackupZip(doc: NotebookDocument, exportedAt = Date.now()): Uint8Array {
  const entries: Zippable = {};
  const files: Record<string, BinaryFileData> = {};
  for (const [id, data] of Object.entries(doc.files)) {
    // Images are already compressed; they are stored as they are.
    entries[`${FILES_DIR}${id}.${extensionFor(data.mimeType)}`] = [
      bytesOfDataUrl(data.dataURL),
      { level: 0 },
    ];
    files[id] = { ...data, dataURL: "" as DataURL };
  }
  entries[NOTEBOOK_ENTRY] = [strToU8(serializeBackup({ ...doc, files }, exportedAt)), { level: 6 }];
  return zipSync(entries);
}

/** Reads a zip backup back into a notebook document. */
export function unpackBackupZip(bytes: Uint8Array): NotebookDocument {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new BackupError("Not a zip file");
  }
  const json = entries[NOTEBOOK_ENTRY];
  if (!json) throw new BackupError("The zip has no notebook.json");
  const doc = parseBackup(strFromU8(json));
  const files: Record<string, BinaryFileData> = {};
  for (const [id, data] of Object.entries(doc.files)) {
    const name = Object.keys(entries).find((entry) => entry.startsWith(`${FILES_DIR}${id}.`));
    if (!name) throw new BackupError(`The zip is missing the image ${id}`);
    files[id] = { ...data, dataURL: dataUrlOf(entries[name], data.mimeType) as DataURL };
  }
  return { ...doc, files };
}

/** Suggested file name for a zip backup, e.g. "field-notes-2026-09-18.typestill.zip". */
export function zipBackupFileName(
  notebook: Pick<NotebookDocument, "name">,
  at = new Date(),
): string {
  const slug =
    notebook.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "notebook";
  return `${slug}-${at.toISOString().slice(0, 10)}.typestill.zip`;
}

/** Whether a file name or type looks like a zip backup rather than the JSON one. */
export function isZipBackup(file: { name: string; type: string }): boolean {
  return file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
}

/** How much a notebook takes: its text and drawing as JSON, and its images decoded. */
export function notebookSize(doc: NotebookDocument): {
  total: number;
  images: number;
  imageCount: number;
} {
  const { files, ...rest } = doc;
  const text = new TextEncoder().encode(JSON.stringify(rest)).length;
  let images = 0;
  for (const data of Object.values(files)) images += dataUrlBytes(data.dataURL);
  return { total: text + images, images, imageCount: Object.keys(files).length };
}

/** "1.2 MB", "340 kB", "12 bytes". */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
