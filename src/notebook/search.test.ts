import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { describe, expect, it } from "vitest";
import { columnFromText } from "../page/document";
import { emptyZine } from "../page/zine";
import { element, textElement } from "../store/fixtures";
import type { Page } from "../store/model";
import { pageText, searchNotebook, snippetAround } from "./search";

const lined = (id: string, ...texts: string[]): Page => ({
  id,
  notebookId: "nb",
  createdAt: 1,
  position: 0,
  kind: "lined",
  fill: 0,
  showPageNumber: true,
  margin: 20,
  columns: texts.map(columnFromText),
  divider: texts.length > 1 ? 100 : null,
  drawing: [],
  drawingLayer: "over",
  canvasView: null,
});

const drawn = (page: Page, ...drawing: ExcalidrawElement[]): Page => ({ ...page, drawing });

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
    drawn(
      lined("p4", "unrelated"),
      textElement("t2", "not this one"),
      element("r1"),
      textElement("t1", "robin nest"),
    ),
    drawn(lined("p5"), textElement("t3", "gone robin", { isDeleted: true })),
  ];

  it("matches case-insensitively, in notebook order, the page's text before its drawing", () => {
    const results = searchNotebook("ROBIN", pages);
    expect(results).toEqual([
      {
        index: 0,
        number: 1,
        where: "text",
        snippet: { before: "The ", match: "robin", after: " sings" },
      },
      {
        index: 1,
        number: 2,
        where: "text",
        snippet: { before: "A ", match: "robin", after: " on the fence" },
      },
      {
        index: 2,
        number: 3,
        where: "text",
        snippet: { before: "", match: "Robin", after: "s everywhere" },
      },
      {
        index: 3,
        number: 4,
        where: "drawing",
        snippet: { before: "", match: "robin", after: " nest" },
      },
    ]);
  });

  it("reports one result per page, at its first match", () => {
    const results = searchNotebook("n", [lined("p", "one\ntwo\nthree")]);
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toEqual({ before: "o", match: "n", after: "e" });
    // The page's text wins over its drawing.
    const both = drawn(lined("p", "written robin"), textElement("t", "drawn robin"));
    expect(searchNotebook("robin", [both])).toEqual([
      {
        index: 0,
        number: 1,
        where: "text",
        snippet: { before: "written ", match: "robin", after: "" },
      },
    ]);
  });

  it("skips deleted and non-text elements of a drawing", () => {
    expect(searchNotebook("gone", pages)).toEqual([]);
    expect(searchNotebook("rectangle", pages)).toEqual([]);
  });

  it("searches the unwrapped text of a drawn element", () => {
    const wrapped = drawn(
      lined("p"),
      textElement("t", "hello\nworld", { originalText: "hello world" }),
    );
    expect(searchNotebook("hello world", [wrapped])).toHaveLength(1);
  });

  it("ignores whitespace around the query and matches nothing on an empty one", () => {
    expect(searchNotebook("  robin ", pages)).toHaveLength(4);
    expect(searchNotebook("", pages)).toEqual([]);
    expect(searchNotebook("   ", pages)).toEqual([]);
  });
});
