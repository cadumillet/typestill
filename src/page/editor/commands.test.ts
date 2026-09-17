import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import { documentFromText, textFromDocument, type EditorDocument } from "../document";
import {
  formatState,
  insertHardBreak,
  parseClipboardText,
  setAlignment,
  setColor,
  splitParagraph,
  toggleBold,
} from "./commands";
import { columnOf, loadColumn, schema } from "./schema";

/** A state over the given text with a selection from `from` to `to` (document positions). */
function stateFor(text: string, from: number, to = from): EditorState {
  const doc = schema.nodeFromJSON(documentFromText(text));
  const state = EditorState.create({ doc });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, from, to)));
}

/** The state after a command, or the same state if it dispatched nothing. */
function run(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

const alignments = (state: EditorState) =>
  state.doc.content.content.map((node) => node.attrs.align as string);

describe("setAlignment", () => {
  // "one" is at 1..4, "two" at 6..9, "three" at 11..16.
  it("aligns the paragraph the caret is in", () => {
    const state = run(stateFor("one\ntwo\nthree", 7), setAlignment("center"));
    expect(alignments(state)).toEqual(["left", "center", "left"]);
  });

  it("aligns every paragraph a selection touches", () => {
    const state = run(stateFor("one\ntwo\nthree", 3, 12), setAlignment("right"));
    expect(alignments(state)).toEqual(["right", "right", "right"]);
  });

  it("leaves untouched paragraphs alone and is a no-op when nothing changes", () => {
    const first = run(stateFor("one\ntwo\nthree", 1, 4), setAlignment("center"));
    expect(alignments(first)).toEqual(["center", "left", "left"]);
    expect(run(first, setAlignment("center"))).toBe(first);
  });
});

describe("splitParagraph", () => {
  it("keeps the alignment on Enter at the end of a paragraph", () => {
    const centred = run(stateFor("one", 4), setAlignment("center"));
    const split = run(centred, splitParagraph);
    expect(alignments(split)).toEqual(["center", "center"]);
    expect(textFromDocument(columnOf(split.doc).doc)).toBe("one\n");
  });

  it("keeps the alignment on both halves when splitting in the middle", () => {
    const centred = run(stateFor("onetwo", 4), setAlignment("center"));
    const split = run(centred, splitParagraph);
    expect(alignments(split)).toEqual(["center", "center"]);
    expect(split.doc.textBetween(0, split.doc.content.size, "|")).toBe("one|two");
  });

  it("keeps the marks being typed with", () => {
    const bold = run(stateFor("one", 1, 4), toggleBold);
    const atEnd = bold.apply(bold.tr.setSelection(TextSelection.create(bold.doc, 4)));
    const split = run(atEnd, splitParagraph);
    expect(split.storedMarks?.map((mark) => mark.type.name)).toEqual(["bold"]);
  });
});

describe("insertHardBreak", () => {
  it("breaks the line inside the paragraph", () => {
    const state = run(stateFor("onetwo", 4), insertHardBreak);
    expect(state.doc.childCount).toBe(1);
    expect(columnOf(state.doc).text).toBe("one\ntwo");
    expect(columnOf(state.doc).doc.content[0].content?.map((n) => n.type)).toEqual([
      "text",
      "hard_break",
      "text",
    ]);
  });
});

describe("marks", () => {
  it("toggles bold over a selection and reports it", () => {
    const plain = stateFor("one two", 1, 4);
    expect(formatState(plain).bold).toBe(false);
    const bold = run(plain, toggleBold);
    expect(formatState(bold).bold).toBe(true);
    expect(columnOf(bold.doc).doc.content[0].content).toEqual([
      { type: "text", text: "one", marks: [{ type: "bold" }] },
      { type: "text", text: " two" },
    ]);
    expect(formatState(run(bold, toggleBold)).bold).toBe(false);
  });

  it("colours a selection, replaces the colour and restores the ink", () => {
    const red = run(stateFor("one two", 1, 4), setColor("#e03131"));
    expect(formatState(red).color).toBe("#e03131");
    const blue = run(red, setColor("#1971c2"));
    expect(columnOf(blue.doc).doc.content[0].content?.[0].marks).toEqual([
      { type: "color", attrs: { color: "#1971c2" } },
    ]);
    const ink = run(blue, setColor(null));
    expect(columnOf(ink.doc).doc.content[0].content?.[0].marks).toBeUndefined();
    expect(formatState(ink).color).toBeNull();
  });

  it("sets the colour for the text typed next when the selection is empty", () => {
    const state = run(stateFor("one", 4), setColor("#2f9e44"));
    expect(formatState(state).color).toBe("#2f9e44");
    const typed = state.apply(state.tr.insertText("!"));
    expect(columnOf(typed.doc).doc.content[0].content?.[1]).toEqual({
      type: "text",
      text: "!",
      marks: [{ type: "color", attrs: { color: "#2f9e44" } }],
    });
  });
});

describe("parseClipboardText", () => {
  it("pastes one paragraph per line, blank lines included, with the paragraph's alignment", () => {
    const centred = run(stateFor("ab", 2), setAlignment("center"));
    const slice = parseClipboardText("x\n\ny", centred.selection.$from);
    const pasted = centred.apply(centred.tr.replaceSelection(slice));
    expect(columnOf(pasted.doc).text).toBe("ax\n\nyb");
    expect(alignments(pasted)).toEqual(["center", "center", "center"]);
  });
});

describe("loadColumn", () => {
  it("falls back to the plain text when the document does not fit the schema", () => {
    const broken = {
      text: "a\nb",
      doc: { type: "doc", content: [{ type: "heading" }] } as unknown as EditorDocument,
    };
    expect(columnOf(loadColumn(broken))).toEqual({ text: "a\nb", doc: documentFromText("a\nb") });
  });

  it("round-trips a formatted document", () => {
    const column = { text: "a\nb", doc: documentFromText("a\nb") };
    column.doc.content[0].attrs.align = "right";
    column.doc.content[0].content![0].marks = [{ type: "italic" }];
    expect(columnOf(loadColumn(column))).toEqual(column);
  });
});
