// Full-text search over one notebook: the pages' text and the canvas's text elements.
// Case-insensitive substring matching, nothing cleverer: no ranking, no fuzziness. Pure,
// so the app can run it on every keystroke and the tests need no browser.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { zineText } from "../page/zine";
import type { Page } from "../store/model";

/** The matched text with a little of its line on either side. */
export interface Snippet {
  /** Text before the match, starting with an ellipsis when the line was cut. */
  before: string;
  /** The match as written on the page, keeping its case. */
  match: string;
  /** Text after the match, ending with an ellipsis when the line was cut. */
  after: string;
}

export interface PageResult {
  kind: "page";
  /** Position in the notebook, and the page number shown to the user (index + 1). */
  index: number;
  number: number;
  snippet: Snippet;
}

export interface CanvasResult {
  kind: "canvas";
  elementId: string;
  snippet: Snippet;
}

export type SearchResult = PageResult | CanvasResult;

/** Characters of the line kept on each side of the match. */
const CONTEXT = 32;

/** A page's searchable text: its columns' plain text, or a zine page's text blocks. */
export function pageText(page: Page): string {
  if (page.kind === "zine") return page.zine ? zineText(page.zine) : "";
  return page.columns.map((column) => column.text).join("\n");
}

/**
 * A canvas text element's text as typed. Excalidraw wraps `text` to the element's
 * width with inserted line breaks; `originalText` is the unwrapped source.
 */
function elementText(element: ExcalidrawElement): string | null {
  if (element.type !== "text" || element.isDeleted) return null;
  return element.originalText || element.text;
}

/** The first case-insensitive occurrence of `query` in `text`, or -1. */
function indexOfQuery(text: string, query: string): number {
  return text.toLowerCase().indexOf(query.toLowerCase());
}

/** The match with up to CONTEXT characters of its own line on each side. */
export function snippetAround(text: string, at: number, length: number): Snippet {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const lineEndAt = text.indexOf("\n", at + length);
  const lineEnd = lineEndAt < 0 ? text.length : lineEndAt;
  const start = Math.max(lineStart, at - CONTEXT);
  const end = Math.min(lineEnd, at + length + CONTEXT);
  return {
    before: (start > lineStart ? "…" : "") + text.slice(start, at),
    match: text.slice(at, at + length),
    after: text.slice(at + length, end) + (end < lineEnd ? "…" : ""),
  };
}

/**
 * Every page and canvas text element containing the query, pages first in notebook
 * order, then text elements in scene order. One result per page or element, with a
 * snippet around its first match. Whitespace around the query is ignored; an empty
 * query matches nothing.
 */
export function searchNotebook(
  query: string,
  pages: readonly Page[],
  elements: readonly ExcalidrawElement[],
): SearchResult[] {
  const needle = query.trim();
  if (!needle) return [];
  const results: SearchResult[] = [];
  pages.forEach((page, index) => {
    const text = pageText(page);
    const at = indexOfQuery(text, needle);
    if (at < 0) return;
    results.push({
      kind: "page",
      index,
      number: index + 1,
      snippet: snippetAround(text, at, needle.length),
    });
  });
  for (const element of elements) {
    const text = elementText(element);
    if (text === null) continue;
    const at = indexOfQuery(text, needle);
    if (at < 0) continue;
    results.push({
      kind: "canvas",
      elementId: element.id,
      snippet: snippetAround(text, at, needle.length),
    });
  }
  return results;
}
