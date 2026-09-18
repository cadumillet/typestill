import { describe, expect, it } from "vitest";
import { emptyZine } from "../page/zine";
import { fileData, imageElement } from "../store/fixtures";
import type { Page } from "../store/model";
import { describeUsage, fileUsage, isUsed, poolEntries, usageBadge } from "./pool";

const page = (id: string, images: (string | null)[] = [], drawn: string[] = []): Page => ({
  id,
  notebookId: "nb",
  createdAt: 1,
  position: 0,
  kind: images.length > 0 ? "zine" : "lined",
  fill: 0,
  showPageNumber: true,
  margin: 20,
  columns: [],
  divider: null,
  drawing: drawn.map((fileId, i) => imageElement(`${id}-${i}`, fileId)),
  drawingLayer: "over",
  canvasView: null,
  ...(images.length > 0
    ? {
        zine: {
          ...emptyZine(),
          rows: [
            {
              blocks: [
                images.length === 1
                  ? { kind: "image", image: images[0] ? { fileId: images[0], fit: "cover" } : null }
                  : {
                      kind: "grid",
                      layout: "row",
                      images: images.map((fileId) => (fileId ? { fileId, fit: "cover" } : null)),
                    },
              ],
            },
          ],
        },
      }
    : {}),
});

describe("media pool", () => {
  it("indexes where each file is used, by page number and on the canvas", () => {
    const pages = [page("a"), page("b", ["f1"]), page("c", ["f2", "f1"]), page("d", [null, "f3"])];
    const usage = fileUsage(pages, ["f3", "f4"]);
    expect(usage.get("f1")).toEqual({ pages: [2, 3], canvas: false });
    expect(usage.get("f2")).toEqual({ pages: [3], canvas: false });
    expect(usage.get("f3")).toEqual({ pages: [4], canvas: true });
    expect(usage.get("f4")).toEqual({ pages: [], canvas: true });
    expect(usage.get("f5")).toBeUndefined();
  });

  it("counts an image drawn on a page as a use, once per page", () => {
    const pages = [
      page("a", [], ["f1"]),
      page("b", ["f1"], ["f1", "f2"]),
      page("c", [], ["f2", "f2"]),
    ];
    const usage = fileUsage(pages, []);
    expect(usage.get("f1")).toEqual({ pages: [1, 2], canvas: false });
    expect(usage.get("f2")).toEqual({ pages: [2, 3], canvas: false });
  });

  it("lists the pool newest first with usage, unused files included", () => {
    const files = {
      f1: { ...fileData("f1"), created: 1 },
      f2: { ...fileData("f2"), created: 3 },
      f3: { ...fileData("f3"), created: 2 },
    };
    const entries = poolEntries(files, [page("a", ["f1"])], ["f3"]);
    expect(entries.map((e) => e.id)).toEqual(["f2", "f3", "f1"]);
    expect(entries.map((e) => isUsed(e.usage))).toEqual([false, true, true]);
    expect(entries.map((e) => usageBadge(e.usage))).toEqual([null, "canvas", "p. 1"]);
  });

  it("badges usage briefly and describes it in words", () => {
    expect(usageBadge({ pages: [2], canvas: false })).toBe("p. 2");
    expect(usageBadge({ pages: [2, 5, 9], canvas: false })).toBe("3 pages");
    expect(usageBadge({ pages: [2, 5], canvas: true })).toBe("2 pages · canvas");
    expect(usageBadge({ pages: [], canvas: false })).toBeNull();
    expect(describeUsage({ pages: [2, 5], canvas: true })).toBe("pages 2, 5 and the canvas");
    expect(describeUsage({ pages: [3], canvas: false })).toBe("page 3");
    expect(describeUsage({ pages: [], canvas: false })).toBe("unused");
  });
});
