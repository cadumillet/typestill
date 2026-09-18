import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { describe, expect, it } from "vitest";
import { columnFromText } from "../page/document";
import { emptyZine } from "../page/zine";
import { element } from "../store/fixtures";
import type { Page } from "../store/model";
import { pageText, searchNotebook, snippetAround } from "./search";

const lined = (id: string, ...texts: string[]): Page => ({
  id,
  notebookId: "nb",
  createdAt: 1,
  kind: "lined",
  tagId: null,
  showPageNumber: true,
  margin: 20,
  columns: texts.map(columnFromText),
  divider: texts.length > 1 ? 100 : null,
  clippings: [],
  canvasView: null,
});

const zine = (id: string, below: string | null, beside: string | null): Page => ({
  ...lined(id),
  kind: "zine",
  columns: [],
  zine: {
    ...emptyZine(),
    rows: [
      {
        blocks: [
          { kind: "image", image: null },
          ...(beside === null
            ? []
            : [{ kind: "text" as const, column: columnFromText(beside), rows: 4 }]),
        ],
      },
      ...(below === null
        ? []
        : [{ blocks: [{ kind: "text" as const, column: columnFromText(below), rows: 4 }] }]),
    ],
  },
});

const text = (
  id: string,
  content: string,
  extra: { originalText?: string; isDeleted?: boolean } = {},
): ExcalidrawElement =>
  ({
    ...element(id, { type: "text", isDeleted: extra.isDeleted ?? false }),
    text: content,
    originalText: extra.originalText ?? content,
  }) as unknown as ExcalidrawElement;

describe("pageText", () => {
  it("joins a lined page's columns and a zine page's text blocks", () => {
    expect(pageText(lined("p", "left\ncolumn", "right"))).toBe("left\ncolumn\nright");
    expect(pageText(zine("z", "below", "beside"))).toBe("beside\nbelow");
    expect(pageText(zine("z", null, "beside"))).toBe("beside");
    expect(pageText({ ...lined("p"), kind: "zine", zine: undefined })).toBe("");
  });
});

describe("snippetAround", () => {
  it("keeps the match's own line, cut to a window around the match", () => {
    expect(snippetAround("first line\nthe quick brown fox\nlast", 15, 5)).toEqual({
      before: "the ",
      match: "quick",
      after: " brown fox",
    });
    const long = `${"a".repeat(50)} needle ${"b".repeat(50)}`;
    const snippet = snippetAround(long, 51, 6);
    expect(snippet.match).toBe("needle");
    expect(snippet.before).toBe(`…${"a".repeat(31)} `);
    expect(snippet.after).toBe(` ${"b".repeat(31)}…`);
  });

  it("marks nothing as cut when the whole line fits", () => {
    expect(snippetAround("short", 0, 5)).toEqual({ before: "", match: "short", after: "" });
  });
});

describe("searchNotebook", () => {
  const pages = [
    lined("p1", "Notes on birds\nThe robin sings"),
    zine("p2", "A robin on the fence", null),
    lined("p3", "nothing here", "Robins everywhere"),
    lined("p4", "unrelated"),
  ];
  const elements = [
    text("t1", "robin nest"),
    text("t2", "not this one"),
    element("r1"),
    text("t3", "gone robin", { isDeleted: true }),
  ];

  it("matches case-insensitively, pages first in notebook order, then canvas text", () => {
    const results = searchNotebook("ROBIN", pages, elements);
    expect(results).toEqual([
      {
        kind: "page",
        index: 0,
        number: 1,
        snippet: { before: "The ", match: "robin", after: " sings" },
      },
      {
        kind: "page",
        index: 1,
        number: 2,
        snippet: { before: "A ", match: "robin", after: " on the fence" },
      },
      {
        kind: "page",
        index: 2,
        number: 3,
        snippet: { before: "", match: "Robin", after: "s everywhere" },
      },
      { kind: "canvas", elementId: "t1", snippet: { before: "", match: "robin", after: " nest" } },
    ]);
  });

  it("reports one result per page, at its first match", () => {
    const results = searchNotebook("n", [lined("p", "one\ntwo\nthree")], []);
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toEqual({ before: "o", match: "n", after: "e" });
  });

  it("skips deleted and non-text elements", () => {
    expect(searchNotebook("gone", [], elements)).toEqual([]);
    expect(searchNotebook("rectangle", [], elements)).toEqual([]);
  });

  it("searches the unwrapped text of a canvas element", () => {
    const wrapped = [text("t", "hello\nworld", { originalText: "hello world" })];
    expect(searchNotebook("hello world", [], wrapped)).toHaveLength(1);
  });

  it("ignores whitespace around the query and matches nothing on an empty one", () => {
    expect(searchNotebook("  robin ", pages, [])).toHaveLength(3);
    expect(searchNotebook("", pages, elements)).toEqual([]);
    expect(searchNotebook("   ", pages, elements)).toEqual([]);
  });
});
