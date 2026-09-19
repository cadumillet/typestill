import { describe, expect, it } from "vitest";
import {
  columnFromDocument,
  columnFromText,
  documentFromText,
  emptyDocument,
  isBlankDocument,
  isColumn,
  isEditorDocument,
  joinDocuments,
  paragraph,
  textFromDocument,
  type EditorDocument,
} from "./document";

describe("documentFromText", () => {
  it("gives new paragraphs the paragraph alignment, the default", () => {
    expect(documentFromText("a").content[0].attrs).toEqual({ align: "paragraph" });
    expect(columnFromText("").doc.content[0].attrs).toEqual({ align: "paragraph" });
  });

  it("makes one paragraph per line, blank lines included", () => {
    expect(documentFromText("")).toEqual(emptyDocument());
    expect(documentFromText("a\nb\n\nc")).toEqual({
      type: "doc",
      content: [paragraph("a"), paragraph("b"), paragraph(), paragraph("c")],
    });
    expect(documentFromText("a\n").content).toHaveLength(2);
  });

  it("round-trips through textFromDocument", () => {
    for (const text of ["", "a", "a\nb", "a\n\n", "\n\na"]) {
      expect(textFromDocument(documentFromText(text))).toBe(text);
      expect(columnFromText(text).text).toBe(text);
    }
  });
});

describe("textFromDocument", () => {
  it("flattens marks and turns hard breaks into line breaks", () => {
    const doc: EditorDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { align: "right" },
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "hard_break" },
            { type: "text", text: "red", marks: [{ type: "color", attrs: { color: "#e03131" } }] },
          ],
        },
        paragraph(),
        paragraph("end"),
      ],
    };
    expect(textFromDocument(doc)).toBe("bold\nred\n\nend");
    expect(columnFromDocument(doc)).toEqual({ text: "bold\nred\n\nend", doc });
  });
});

describe("joinDocuments", () => {
  it("appends the paragraphs of the second document", () => {
    const joined = joinDocuments(documentFromText("a\nb"), documentFromText("c"));
    expect(textFromDocument(joined)).toBe("a\nb\nc");
  });

  it("adds nothing for a blank document", () => {
    const a = documentFromText("a");
    expect(joinDocuments(a, emptyDocument())).toBe(a);
    expect(joinDocuments(emptyDocument(), a)).toBe(a);
    expect(isBlankDocument(joinDocuments(emptyDocument(), emptyDocument()))).toBe(true);
  });
});

describe("isEditorDocument", () => {
  it("accepts what the editor produces", () => {
    expect(isEditorDocument(documentFromText("a\nb"))).toBe(true);
    expect(
      isEditorDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { align: "center" },
            content: [
              { type: "text", text: "a", marks: [{ type: "bold" }, { type: "italic" }] },
              { type: "hard_break", marks: [{ type: "bold" }] },
              { type: "text", text: "b", marks: [{ type: "color", attrs: { color: "#1971c2" } }] },
              { type: "text", text: "c", marks: [{ type: "highlight", attrs: { tint: "green" } }] },
            ],
          },
        ],
      }),
    ).toBe(true);
    expect(isColumn(columnFromText("x"))).toBe(true);
    // The fourth alignment, since backup version 11.
    expect(
      isEditorDocument({
        type: "doc",
        content: [{ type: "paragraph", attrs: { align: "paragraph" }, content: [] }],
      }),
    ).toBe(true);
  });

  it("rejects other shapes", () => {
    expect(isEditorDocument("a")).toBe(false);
    expect(isEditorDocument({ type: "doc", content: [] })).toBe(false);
    expect(isEditorDocument({ type: "doc", content: [{ type: "paragraph" }] })).toBe(false);
    expect(
      isEditorDocument({
        type: "doc",
        content: [{ type: "paragraph", attrs: { align: "justify" } }],
      }),
    ).toBe(false);
    expect(
      isEditorDocument({
        type: "doc",
        content: [{ type: "paragraph", attrs: { align: "left" }, content: [{ type: "image" }] }],
      }),
    ).toBe(false);
    expect(
      isEditorDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { align: "left" },
            content: [{ type: "text", text: "a", marks: [{ type: "color" }] }],
          },
        ],
      }),
    ).toBe(false);
    for (const marks of [
      [{ type: "highlight" }],
      [{ type: "highlight", attrs: { tint: "red" } }],
    ]) {
      expect(
        isEditorDocument({
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { align: "left" },
              content: [{ type: "text", text: "a", marks }],
            },
          ],
        }),
      ).toBe(false);
    }
    expect(isColumn({ text: "x" })).toBe(false);
    expect(isColumn({ doc: documentFromText("x") })).toBe(false);
  });
});
