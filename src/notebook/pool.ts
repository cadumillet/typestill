// The media pool: every image in the notebook, with where each one is used. A view over
// the files table with a usage index built from the zine pages' media blocks and the
// canvas's image elements. An image in use anywhere cannot be deleted.

import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { zineFileIds } from "../page/zine";
import type { Page } from "../store/model";

export interface FileUsage {
  /** Page numbers (1-based) whose media block shows the image. */
  pages: number[];
  canvas: boolean;
}

export interface PoolEntry {
  id: string;
  data: BinaryFileData;
  usage: FileUsage;
}

/** The drag type a pool image travels as, carrying its file id. */
export const POOL_DRAG_TYPE = "application/x-typestill-file";

export function isUsed(usage: FileUsage): boolean {
  return usage.pages.length > 0 || usage.canvas;
}

/** Where every file is used: the pages, in notebook order, and the canvas. */
export function fileUsage(
  pages: readonly Page[],
  canvasFileIds: readonly string[],
): Map<string, FileUsage> {
  const usage = new Map<string, FileUsage>();
  const of = (id: string) => {
    let entry = usage.get(id);
    if (!entry) {
      entry = { pages: [], canvas: false };
      usage.set(id, entry);
    }
    return entry;
  };
  pages.forEach((page, index) => {
    if (page.zine) for (const id of zineFileIds(page.zine)) of(id).pages.push(index + 1);
  });
  for (const id of canvasFileIds) of(id).canvas = true;
  return usage;
}

/** The pool's entries, newest first. */
export function poolEntries(
  files: Record<string, BinaryFileData>,
  pages: readonly Page[],
  canvasFileIds: readonly string[],
): PoolEntry[] {
  const usage = fileUsage(pages, canvasFileIds);
  return Object.values(files)
    .sort((a, b) => b.created - a.created)
    .map((data) => ({
      id: data.id,
      data,
      usage: usage.get(data.id) ?? { pages: [], canvas: false },
    }));
}

/** "p. 2, 5 · canvas", or "unused". */
export function describeUsage(usage: FileUsage): string {
  const parts: string[] = [];
  if (usage.pages.length > 0) parts.push(`p. ${usage.pages.join(", ")}`);
  if (usage.canvas) parts.push("canvas");
  return parts.length > 0 ? parts.join(" · ") : "unused";
}
