import { describe, expect, it } from "vitest";
import { columnFromText } from "./document";
import { isZine } from "./zine";
import { convertLegacyZine, isLegacyZine, type LegacyZine } from "./zineLegacy";

const image = (fileId: string) => ({ fileId, fit: "cover" as const });
const legacy = (patch: Partial<LegacyZine> = {}): LegacyZine => ({
  padding: 8,
  media: { layout: "single", images: [null] },
  textBelow: null,
  textBeside: null,
  textSide: "right",
  textRows: 4,
  ...patch,
});

describe("legacy zine", () => {
  it("recognises the old shape and not the new one", () => {
    expect(isLegacyZine(legacy())).toBe(true);
    expect(
      isLegacyZine(legacy({ media: { layout: "square", images: [image("a"), null, null, null] } })),
    ).toBe(true);
    expect(isLegacyZine({ padding: 0, rows: [] })).toBe(false);
    expect(isLegacyZine(legacy({ media: { layout: "row", images: [null] } }))).toBe(false);
    expect(isLegacyZine(legacy({ textRows: 0 }))).toBe(false);
    expect(isLegacyZine(null)).toBe(false);
  });

  it("turns a page with no images and no writing into an empty page, keeping the padding", () => {
    expect(convertLegacyZine(legacy())).toEqual({ padding: 8, rows: [] });
    expect(
      convertLegacyZine(legacy({ textBelow: columnFromText(""), textBeside: columnFromText("") })),
    ).toEqual({ padding: 8, rows: [] });
  });

  it("makes the media block the first row and the text below a second row", () => {
    const converted = convertLegacyZine(
      legacy({
        padding: 0,
        media: { layout: "row", images: [image("a"), null] },
        textBelow: columnFromText("caption"),
        textRows: 3,
      }),
    );
    expect(converted).toEqual({
      padding: 0,
      rows: [
        { blocks: [{ kind: "grid", layout: "row", images: [image("a"), null] }] },
        { blocks: [{ kind: "text", column: columnFromText("caption"), rows: 3 }] },
      ],
    });
    expect(isZine(converted)).toBe(true);
  });

  it("puts the text beside on the side it had, as the media row's second block", () => {
    const right = convertLegacyZine(
      legacy({
        media: { layout: "single", images: [image("a")] },
        textBeside: columnFromText("note"),
      }),
    );
    expect(right.rows).toEqual([
      {
        blocks: [
          { kind: "image", image: image("a") },
          { kind: "text", column: columnFromText("note"), rows: 4 },
        ],
      },
    ]);
    const left = convertLegacyZine(
      legacy({
        media: { layout: "single", images: [image("a")] },
        textBeside: columnFromText("note"),
        textSide: "left",
      }),
    );
    expect(left.rows[0].blocks.map((b) => b.kind)).toEqual(["text", "image"]);
  });

  it("keeps a media block with empty cells when there is writing", () => {
    const converted = convertLegacyZine(legacy({ textBelow: columnFromText("only words") }));
    expect(converted.rows).toHaveLength(2);
    expect(converted.rows[0].blocks[0]).toEqual({ kind: "image", image: null });
  });
});
