import { describe, expect, it } from "vitest";
import { emptyZine } from "../page/zine";
import { fileData } from "../store/fixtures";
import type { Page } from "../store/model";
import { describeUsage, fileUsage, isUsed, poolEntries } from "./pool";

const page = (id: string, images: (string | null)[] = []): Page => ({
  id,
  notebookId: "nb",
  createdAt: 1,
  kind: images.length > 0 ? "zine" : "lined",
  tagId: null,
  showDate: true,
  showPageNumber: true,
  margin: 20,
  columns: [],
  divider: null,
  canvasView: null,
  ...(images.length > 0
    ? {
        zine: {
          ...emptyZine(),
          media: {
            layout: images.length === 1 ? "single" : "row",
            images: images.map((fileId) => (fileId ? { fileId, fit: "cover" } : null)),
          },
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

  it("lists the pool newest first with usage, unused files included", () => {
    const files = {
      f1: { ...fileData("f1"), created: 1 },
      f2: { ...fileData("f2"), created: 3 },
      f3: { ...fileData("f3"), created: 2 },
    };
    const entries = poolEntries(files, [page("a", ["f1"])], ["f3"]);
    expect(entries.map((e) => e.id)).toEqual(["f2", "f3", "f1"]);
    expect(entries.map((e) => isUsed(e.usage))).toEqual([false, true, true]);
    expect(entries.map((e) => describeUsage(e.usage))).toEqual(["unused", "canvas", "p. 1"]);
    expect(describeUsage({ pages: [2, 5], canvas: true })).toBe("p. 2, 5 · canvas");
  });
});
