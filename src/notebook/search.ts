// Full-text search over one notebook: the pages' text and the text drawn on them.
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
  /** Position in the notebook, and the page number shown to the user (index + 1). */
  index: number;
  number: number;
  /** What matched: the page's written text, or a text element of its drawing. */
  where: "text" | "drawing";
  snippet: Snippet;
}

export type SearchResult = PageResult;

/** Characters of the line kept on each side of the match. */
const CONTEXT = 32;

/** A page's searchable text: its columns' plain text, or a zine page's text blocks. */
export function pageText(page: Page): string {
  if (page.kind === "zine") return page.zine ? zineText(page.zine) : "";
  return page.columns.map((column) => column.text).join("\n");
}

/**
 * A drawn text element's text as typed. Excalidraw wraps `text` to the element's width
 * with inserted line breaks; `originalText` is the unwrapped source.
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
 * Every page containing the query, in notebook order. One result per page, with a
 * snippet around its first match: in the page's text first, else in the text drawn on
 * it, element by element in scene order. Whitespace around the query is ignored; an
 * empty query matches nothing.
 */
export function searchNotebook(query: string, pages: readonly Page[]): SearchResult[] {
  const needle = query.trim();
  if (!needle) return [];
  const results: SearchResult[] = [];
  pages.forEach((page, index) => {
    const text = pageText(page);
    const at = indexOfQuery(text, needle);
    if (at >= 0) {
      results.push({
        index,
        number: index + 1,
        where: "text",
        snippet: snippetAround(text, at, needle.length),
      });
      return;
    }
    for (const element of page.drawing) {
      const drawn = elementText(element);
      if (drawn === null) continue;
      const drawnAt = indexOfQuery(drawn, needle);
      if (drawnAt < 0) continue;
      results.push({
        index,
        number: index + 1,
        where: "drawing",
        snippet: snippetAround(drawn, drawnAt, needle.length),
      });
      return;
    }
  });
  return results;
}
