import { EditorState, TextSelection } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import { documentFromText } from "../document";
import { splitParagraph } from "./commands";
import { editorPlugins } from "./plugins";
import { schema } from "./schema";

/** A state over the given text with the editor's plugins and the caret at the end. */
function stateFor(text: string): EditorState {
  const doc = schema.nodeFromJSON(documentFromText(text));
  const state = EditorState.create({ doc, plugins: editorPlugins() });
  return state.apply(state.tr.setSelection(TextSelection.atEnd(doc)));
}

const enter = (state: EditorState): EditorState => {
  let next = state;
  splitParagraph(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
};

describe("the continuous page", () => {
  it("refuses nothing: a document grows past any line count and is measured, not dropped", () => {
    // Two lines available, say: a third paragraph and more text are accepted all the same.
    let state = stateFor("a\nb");
    state = enter(state);
    expect(state.doc.childCount).toBe(3);
    state = state.apply(state.tr.insertText("c"));
    expect(state.doc.textContent).toBe("abc");
    state = enter(state);
    expect(state.doc.childCount).toBe(4);
    // What the page does with it: counts the lines past the end, for its label.
    const limit = 2;
    const used = state.doc.childCount;
    expect(Math.max(0, used - limit)).toBe(2);
    expect(editorPlugins().some((plugin) => plugin.spec.filterTransaction)).toBe(false);
  });
});
