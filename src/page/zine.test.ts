import { describe, expect, it } from "vitest";
import { columnFromText } from "./document";
import {
  cellCount,
  defaultCell,
  emptyZine,
  imagesForLayout,
  isZine,
  isZineEmpty,
  placeImages,
  zineFileIds,
  zineGeometry,
  zineText,
  type Zine,
} from "./zine";

const a5 = { width: 148, height: 210 };
const image = (fileId: string) => ({ fileId, fit: "cover" as const });

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
    const zine: Zine = {
      ...emptyZine(),
      media: { layout: "square", images: [null, image("b"), null, null] },
    };
    expect(placeImages(zine, 1, ["x", "y", "z", "w"]).media.images).toEqual([
      null,
      image("x"),
      image("y"),
      image("z"),
    ]);
    expect(placeImages(zine, 3, ["x", "y"]).media.images).toEqual([
      null,
      image("b"),
      null,
      image("x"),
    ]);
    expect(placeImages(zine, 9, ["x"])).toEqual(zine);
    expect(defaultCell(zine)).toBe(0);
    expect(
      defaultCell({ ...zine, media: { layout: "row", images: [image("a"), image("b")] } }),
    ).toBeNull();
    expect(defaultCell({ ...zine, media: { layout: "row", images: [image("a"), null] } })).toBe(1);
  });

  it("knows an empty page, its files and its text", () => {
    const zine = emptyZine();
    expect(isZineEmpty(zine)).toBe(true);
    expect(zineFileIds(zine)).toEqual([]);
    expect(zineText(zine)).toBe("");
    const filled: Zine = {
      ...zine,
      media: { layout: "square", images: [image("a"), null, image("a"), image("b")] },
      textBelow: columnFromText("below"),
      textBeside: columnFromText("beside"),
    };
    expect(isZineEmpty(filled)).toBe(false);
    expect(zineFileIds(filled)).toEqual(["a", "b"]);
    expect(zineText(filled)).toBe("below\nbeside");
    expect(isZineEmpty({ ...zine, textBelow: columnFromText("") })).toBe(true);
    expect(isZineEmpty({ ...zine, textBelow: columnFromText("x") })).toBe(false);
  });

  it("lays out a single image inset by the padding", () => {
    const geometry = zineGeometry(a5, emptyZine());
    expect(geometry.media).toEqual({ left: 8, top: 8, width: 132, height: 194 });
    expect(geometry.cells).toEqual([geometry.media]);
    expect(geometry.textBelow).toBeNull();
    expect(geometry.textBeside).toBeNull();
  });

  it("bleeds to the edges at zero padding, with no gap between cells", () => {
    const zine: Zine = {
      ...emptyZine(),
      padding: 0,
      media: { layout: "row", images: [null, null] },
    };
    const { media, cells } = zineGeometry(a5, zine);
    expect(media).toEqual({ left: 0, top: 0, width: 148, height: 210 });
    expect(cells).toEqual([
      { left: 0, top: 0, width: 74, height: 210 },
      { left: 74, top: 0, width: 74, height: 210 },
    ]);
  });

  it("splits grids with the padding as the gap", () => {
    const zine: Zine = {
      ...emptyZine(),
      padding: 10,
      media: { layout: "square", images: [null, null, null, null] },
    };
    const { cells } = zineGeometry(a5, zine);
    expect(cells).toHaveLength(4);
    expect(cells[0]).toEqual({ left: 10, top: 10, width: 59, height: 90 });
    expect(cells[1]).toEqual({ left: 79, top: 10, width: 59, height: 90 });
    expect(cells[2]).toEqual({ left: 10, top: 110, width: 59, height: 90 });
    expect(cells[3]).toEqual({ left: 79, top: 110, width: 59, height: 90 });
    const column = zineGeometry(a5, { ...zine, media: { layout: "column", images: [null, null] } });
    expect(column.cells.map((c) => c.top)).toEqual([10, 110]);
    expect(column.cells[0].width).toBe(128);
  });

  it("reserves text rows below the media", () => {
    const zine: Zine = { ...emptyZine(), padding: 10, textBelow: columnFromText(""), textRows: 4 };
    const { media, textBelow } = zineGeometry(a5, zine, 7);
    // 28mm of text at the bottom plus the 10mm gap above it.
    expect(media).toEqual({ left: 10, top: 10, width: 128, height: 210 - 20 - 28 - 10 });
    expect(textBelow).toEqual({ left: 12, top: 210 - 10 - 28, width: 124, height: 28 });
  });

  it("reserves a third of the width beside the media, on either side", () => {
    const zine: Zine = { ...emptyZine(), padding: 6, textBeside: columnFromText("") };
    const right = zineGeometry(a5, zine);
    const third = 148 / 3;
    expect(right.media.left).toBe(6);
    expect(right.media.width).toBeCloseTo(136 - third - 6);
    expect(right.textBeside?.left).toBeCloseTo(142 - third + 2);
    expect(right.textBeside?.width).toBeCloseTo(third - 4);
    expect(right.textBeside?.top).toBe(8);
    expect(right.textBeside?.height).toBe(198 - 4);
    const left = zineGeometry(a5, { ...zine, textSide: "left" });
    expect(left.textBeside?.left).toBe(8);
    expect(left.media.left).toBeCloseTo(6 + third + 6);
    expect(left.media.width).toBeCloseTo(right.media.width);
  });

  it("puts text below under the media only when both blocks are on", () => {
    const zine: Zine = {
      ...emptyZine(),
      padding: 0,
      textBelow: columnFromText(""),
      textBeside: columnFromText(""),
      textRows: 2,
    };
    const { media, textBelow, textBeside } = zineGeometry(a5, zine, 7);
    expect(media.width).toBeCloseTo(148 - 148 / 3);
    expect(media.height).toBe(210 - 14);
    expect(textBelow?.width).toBeCloseTo(media.width - 8);
    expect(textBelow?.top).toBe(196);
    expect(textBeside?.height).toBe(210 - 8);
  });

  it("validates stored zines", () => {
    expect(isZine(emptyZine())).toBe(true);
    expect(isZine({ ...emptyZine(), media: { layout: "row", images: [image("a"), null] } })).toBe(
      true,
    );
    expect(isZine(null)).toBe(false);
    expect(isZine({ ...emptyZine(), padding: -1 })).toBe(false);
    expect(isZine({ ...emptyZine(), media: { layout: "row", images: [null] } })).toBe(false);
    expect(
      isZine({
        ...emptyZine(),
        media: { layout: "single", images: [{ fileId: "", fit: "cover" }] },
      }),
    ).toBe(false);
    expect(
      isZine({
        ...emptyZine(),
        media: { layout: "single", images: [{ fileId: "a", fit: "fill" }] },
      }),
    ).toBe(false);
    expect(isZine({ ...emptyZine(), textSide: "top" })).toBe(false);
    expect(isZine({ ...emptyZine(), textRows: 0 })).toBe(false);
    expect(isZine({ ...emptyZine(), textBeside: { text: "x" } })).toBe(false);
  });
});
