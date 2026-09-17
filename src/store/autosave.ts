// Debounced, deduplicated saving of one thing: a page's text or the canvas drawing.
// Excalidraw's onChange fires on every pointer move and text editors fire per keystroke,
// so writes are coalesced and skipped when the content's key has not changed.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Column } from "../page/document";

export interface AutosaveOptions<T> {
  save: (value: T) => Promise<void>;
  /** Cheap identity of a value. Equal keys mean nothing to save. */
  key: (value: T) => string;
  /** Quiet time before a save, in ms. */
  delayMs?: number;
  onError?: (error: unknown) => void;
}

export interface Autosave<T> {
  /** Feed every change here. */
  onChange(value: T): void;
  /** Treat the given value as already persisted, e.g. right after loading. */
  markClean(value: T): void;
  /** Saves pending changes now. Resolves once the save is done. */
  flush(): Promise<void>;
  /** Cancels any pending save without writing it. */
  dispose(): void;
}

/** Key for a drawing: which live elements exist, and at what version. */
export function elementsKey(elements: readonly ExcalidrawElement[]): string {
  let out = "";
  for (const element of elements) {
    if (!element.isDeleted) out += `${element.id}:${element.version}|`;
  }
  return out;
}

/** Key for a page's columns: their documents, which carry the text and the formatting. */
export function columnsKey(columns: readonly Column[]): string {
  return JSON.stringify(columns.map((column) => column.doc));
}

export function createAutosave<T>({
  save,
  key,
  delayMs = 500,
  onError,
}: AutosaveOptions<T>): Autosave<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T; key: string } | null = null;
  let savedKey = "";
  let chain: Promise<void> = Promise.resolve();

  const cancelTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const run = (): Promise<void> => {
    cancelTimer();
    const job = pending;
    pending = null;
    if (!job || job.key === savedKey) return chain;
    chain = chain
      .then(() => save(job.value))
      .then(() => {
        savedKey = job.key;
      })
      .catch((error: unknown) => {
        onError?.(error);
      });
    return chain;
  };

  return {
    onChange(value) {
      const k = key(value);
      if (k === savedKey || k === pending?.key) return;
      pending = { value, key: k };
      cancelTimer();
      timer = setTimeout(run, delayMs);
    },
    markClean(value) {
      savedKey = key(value);
      pending = null;
      cancelTimer();
    },
    flush: run,
    dispose() {
      cancelTimer();
      pending = null;
    },
  };
}
