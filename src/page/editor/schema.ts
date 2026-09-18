// The page editor's schema: paragraphs with an alignment, text with bold, italic, colour
// and highlight marks, and a hard break for a line break inside a paragraph. Nothing else.
// The JSON of these documents is what a column stores (see ../document.ts).

import { Schema, type Node as EditorNode } from "prosemirror-model";
import { inkColorOf } from "../../canvas/palette";
import {
  ALIGNMENTS,
  documentFromText,
  isTint,
  type Alignment,
  type Column,
  type EditorDocument,
} from "../document";

function alignmentOf(dom: HTMLElement): Alignment {
  const value = dom.style.textAlign || dom.getAttribute("align") || "";
  return ALIGNMENTS.includes(value as Alignment) && value !== "left"
    ? (value as Alignment)
    : "left";
}

export const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      content: "inline*",
      attrs: { align: { default: "left" } },
      parseDOM: [{ tag: "p", getAttrs: (dom) => ({ align: alignmentOf(dom) }) }],
      toDOM: (node) => [
        "p",
        node.attrs.align === "left" ? {} : { style: `text-align: ${node.attrs.align}` },
        0,
      ],
    },
    text: { group: "inline" },
    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },
  },
  marks: {
    bold: {
      parseDOM: [
        { tag: "strong" },
        { tag: "b", getAttrs: (dom) => dom.style.fontWeight !== "normal" && null },
        { style: "font-weight=400", clearMark: (mark) => mark.type.name === "bold" },
        {
          style: "font-weight",
          getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null,
        },
      ],
      toDOM: () => ["strong", 0],
    },
    italic: {
      parseDOM: [
        { tag: "i" },
        { tag: "em" },
        { style: "font-style=italic" },
        { style: "font-style=normal", clearMark: (mark) => mark.type.name === "italic" },
      ],
      toDOM: () => ["em", 0],
    },
    // Only palette colours survive a paste; anything else is dropped.
    color: {
      attrs: { color: {} },
      parseDOM: [
        {
          style: "color",
          getAttrs: (value) => {
            const color = inkColorOf(value);
            return color ? { color } : false;
          },
        },
      ],
      toDOM: (mark) => ["span", { style: `color: ${mark.attrs.color}` }, 0],
    },
    // A marker stroke behind the text, by tint id; the theme picks the colour. Only our
    // own <mark data-tint> is read back: pasted background colours are dropped.
    highlight: {
      attrs: { tint: {} },
      parseDOM: [
        {
          tag: "mark",
          getAttrs: (dom) => {
            const tint = dom.getAttribute("data-tint");
            return isTint(tint) ? { tint } : false;
          },
        },
      ],
      toDOM: (mark) => ["mark", { "data-tint": mark.attrs.tint }, 0],
    },
  },
});

/**
 * The editor node for a column. A document that does not fit the schema (a hand-edited
 * backup, say) falls back to the column's plain text, so nothing is lost.
 */
export function loadColumn(column: Column): EditorNode {
  try {
    const node = schema.nodeFromJSON(column.doc);
    node.check();
    return node;
  } catch {
    return schema.nodeFromJSON(documentFromText(column.text));
  }
}

/** The stored form of an editor node: paragraphs joined by line breaks, plus the JSON. */
export function columnOf(node: EditorNode): Column {
  return {
    text: node.textBetween(0, node.content.size, "\n", "\n"),
    doc: node.toJSON() as EditorDocument,
  };
}
