import { describe, expect, it } from "vitest";
import { columnFromText } from "./document";
import {
  addBlock,
  cellCount,
  defaultCell,
  emptyZine,
  imagesForLayout,
  isZine,
  isZineEmpty,
  mediaBlockOf,
  placeImages,
  removeBlock,
  zineFileIds,
  zineGeometry,
  zineOptions,
  zineText,
  type Zine,
  type ZineBlock,
} from "./zine";

const a5 = { width: 148, height: 210 };
const image = (fileId: string) => ({ fileId, fit: "cover" as const });
const text = (value: string, rows = 4): ZineBlock => ({
  kind: "text",
  column: columnFromText(value),
  rows,
});
const page = (...rows: ZineBlock[][]): Zine => ({
  padding: 0,
  rows: rows.map((blocks) => ({ blocks })),
});

describe("zine helpers", () => {
  it("sizes the images array to the layout", () => {
    expect(cellCount("single")).toBe(1);
    expect(cellCount("row")).toBe(2);
    expect(cellCount("column")).toBe(2);
    expect(cellCount("square")).toBe(4);
    expect(imagesForLayout([image("a"), image("b")], "single")).toEqual([image("a")]);
    expect(imagesForLayout([image("a")], "square")).toEqual([image("a"), null, null, null]);
  });

  it("places images into the chosen cell, then the empty cells after it", () => {
    const zine = page([{ kind: "grid", layout: "square", images: [null, image("b"), null, null] }]);
    const cells = (z: Zine) => {
      const media = mediaBlockOf(z)!.block;
      return media.kind === "grid" ? media.images : [media.image];
    };
    expect(cells(placeImages(zine, 1, ["x", "y", "z", "w"]))).toEqual([
      null,
      image("x"),
      image("y"),
      image("z"),
    ]);
    expect(cells(placeImages(zine, 3, ["x", "y"]))).toEqual([null, image("b"), null, image("x")]);
    expect(placeImages(zine, 9, ["x"])).toEqual(zine);
    expect(defaultCell(zine)).toBe(0);
    expect(
      defaultCell(page([{ kind: "grid", layout: "row", images: [image("a"), image("b")] }])),
    ).toBeNull();
    expect(defaultCell(page([{ kind: "image", image: null }]))).toBe(0);
    expect(defaultCell(emptyZine())).toBeNull();
  });

  it("gives a page with no media block one sized to the images placed", () => {
    expect(placeImages(emptyZine(), 0, ["a"]).rows).toEqual([
      { blocks: [{ kind: "image", image: image("a") }] },
    ]);
    expect(placeImages(page([text("caption")]), 0, ["a", "b"]).rows).toEqual([
      { blocks: [text("caption")] },
      { blocks: [{ kind: "grid", layout: "row", images: [image("a"), image("b")] }] },
    ]);
    const many = placeImages(emptyZine(), 0, ["a", "b", "c", "d", "e"]);
    expect(many.rows[0].blocks[0]).toEqual({
      kind: "grid",
      layout: "square",
      images: [image("a"), image("b"), image("c"), image("d")],
    });
  });

  it("knows an empty page, its files and its text", () => {
    const zine = emptyZine();
    expect(zine).toEqual({ padding: 0, rows: [] });
    expect(isZineEmpty(zine)).toBe(true);
    expect(zineFileIds(zine)).toEqual([]);
    expect(zineText(zine)).toBe("");
    const filled = page(
      [
        { kind: "grid", layout: "square", images: [image("a"), null, image("a"), image("b")] },
        text("beside"),
      ],
      [text("below")],
    );
    expect(isZineEmpty(filled)).toBe(false);
    expect(zineFileIds(filled)).toEqual(["a", "b"]);
    expect(zineText(filled)).toBe("beside\nbelow");
    // A placeholder block is composition, not an empty page.
    expect(isZineEmpty(page([{ kind: "image", image: null }]))).toBe(false);
  });

  it("offers what can be added: one media block, one text beside, one text row", () => {
    expect(zineOptions(emptyZine())).toEqual({ below: ["image", "grid", "text"], beside: null });
    const media = page([{ kind: "image", image: null }]);
    expect(zineOptions(media)).toEqual({ below: ["text"], beside: 0 });
    const beside = addBlock(media, { row: 0, side: "right" }, "text");
    expect(beside.rows[0].blocks.map((b) => b.kind)).toEqual(["image", "text"]);
    expect(zineOptions(beside)).toEqual({ below: ["text"], beside: null });
    const full = addBlock(beside, { row: "below" }, "text");
    expect(zineOptions(full)).toEqual({ below: [], beside: null });
    const textFirst = addBlock(emptyZine(), { row: "below" }, "text");
    expect(zineOptions(textFirst)).toEqual({ below: ["image", "grid"], beside: null });
    const then = addBlock(textFirst, { row: "below" }, "grid");
    expect(zineOptions(then)).toEqual({ below: [], beside: 1 });
    expect(
      addBlock(then, { row: 1, side: "left" }, "text").rows[1].blocks.map((b) => b.kind),
    ).toEqual(["text", "grid"]);
  });

  it("removes a block and drops the row it leaves empty", () => {
    const zine = page([{ kind: "image", image: null }, text("beside")], [text("below")]);
    expect(removeBlock(zine, { row: 1, index: 0 }).rows).toHaveLength(1);
    expect(removeBlock(zine, { row: 0, index: 0 }).rows[0].blocks).toEqual([text("beside")]);
    expect(isZineEmpty(removeBlock(page([text("x")]), { row: 0, index: 0 }))).toBe(true);
  });

  it("lays a single image over the whole page at zero padding", () => {
    const geometry = zineGeometry(a5, page([{ kind: "image", image: null }]));
    expect(geometry.inner).toEqual({ left: 0, top: 0, width: 148, height: 210 });
    const [[block]] = geometry.rows;
    expect(block.box).toEqual({ left: 0, top: 0, width: 148, height: 210 });
    expect(block.cells).toEqual([block.box]);
  });

  it("insets by the padding and splits grids with the padding as the gap", () => {
    const zine: Zine = {
      padding: 10,
      rows: [{ blocks: [{ kind: "grid", layout: "square", images: [null, null, null, null] }] }],
    };
    const [[block]] = zineGeometry(a5, zine).rows;
    expect(block.box).toEqual({ left: 10, top: 10, width: 128, height: 190 });
    expect(block.cells).toEqual([
      { left: 10, top: 10, width: 59, height: 90 },
      { left: 79, top: 10, width: 59, height: 90 },
      { left: 10, top: 110, width: 59, height: 90 },
      { left: 79, top: 110, width: 59, height: 90 },
    ]);
    const column = zineGeometry(a5, {
      padding: 10,
      rows: [{ blocks: [{ kind: "grid", layout: "column", images: [null, null] }] }],
    });
    expect(column.rows[0][0].cells.map((c) => c.top)).toEqual([10, 110]);
    expect(column.rows[0][0].cells[0].width).toBe(128);
  });

  it("gives a text row its rows of text and the media row what is left", () => {
    const zine: Zine = {
      padding: 10,
      rows: [{ blocks: [{ kind: "image", image: null }] }, { blocks: [text("", 4)] }],
    };
    const [[media], [caption]] = zineGeometry(a5, zine, 7, 2).rows;
    // 28mm of text plus 2mm inset above and below, then the 10mm gap above it.
    expect(caption.box).toEqual({ left: 10, top: 210 - 10 - 32, width: 128, height: 32 });
    expect(caption.text).toEqual({ left: 12, top: 210 - 10 - 30, width: 124, height: 28 });
    expect(caption.lines).toBe(4);
    expect(media.box).toEqual({ left: 10, top: 10, width: 128, height: 190 - 32 - 10 });
  });

  it("splits a row in half and fits a beside text block to the row's height", () => {
    const zine: Zine = {
      padding: 0,
      rows: [{ blocks: [text("", 4), { kind: "image", image: null }] }],
    };
    const [[beside, media]] = zineGeometry(a5, zine, 7, 2).rows;
    expect(beside.box).toEqual({ left: 0, top: 0, width: 74, height: 210 });
    expect(media.box).toEqual({ left: 74, top: 0, width: 74, height: 210 });
    // Bleeding pages inset the text twice as much, to clear the edge.
    expect(beside.text).toEqual({ left: 4, top: 4, width: 66, height: 202 });
    expect(beside.lines).toBe(Math.floor(202 / 7));
  });

  it("validates stored zines", () => {
    expect(isZine(emptyZine())).toBe(true);
    expect(
      isZine(page([{ kind: "grid", layout: "row", images: [image("a"), null] }, text("x")])),
    ).toBe(true);
    expect(isZine(null)).toBe(false);
    expect(isZine({ padding: -1, rows: [] })).toBe(false);
    expect(isZine({ padding: 0 })).toBe(false);
    expect(isZine({ padding: 0, rows: [{ blocks: [] }] })).toBe(false);
    expect(isZine(page([text("a"), text("b"), text("c")]))).toBe(false);
    expect(isZine(page([{ kind: "grid", layout: "row", images: [null] }]))).toBe(false);
    expect(isZine(page([{ kind: "grid", layout: "single", images: [null] } as never]))).toBe(false);
    expect(isZine(page([{ kind: "image", image: { fileId: "", fit: "cover" } }]))).toBe(false);
    expect(isZine(page([{ kind: "image", image: { fileId: "a", fit: "fill" } } as never]))).toBe(
      false,
    );
    expect(isZine(page([{ kind: "text", column: columnFromText(""), rows: 0 }]))).toBe(false);
    expect(isZine(page([{ kind: "text", column: { text: "x" }, rows: 1 } as never]))).toBe(false);
    expect(isZine(page([{ kind: "sticker" } as never]))).toBe(false);
    // The old shape is not a zine of this version.
    expect(
      isZine({
        padding: 0,
        media: { layout: "single", images: [null] },
        textBelow: null,
        textBeside: null,
        textSide: "right",
        textRows: 4,
      }),
    ).toBe(false);
  });
});
