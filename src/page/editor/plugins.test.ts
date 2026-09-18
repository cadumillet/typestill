import { EditorState, TextSelection } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import { documentFromText } from "../document";
import { splitParagraph } from "./commands";
import { capacityPlugin, editorPlugins, undoUnchecked } from "./plugins";
import { schema } from "./schema";

/** A state whose capacity counts paragraphs as lines, capped at `limit`. */
function stateFor(text: string, limit: number, onReject?: () => void): EditorState {
  const doc = schema.nodeFromJSON(documentFromText(text));
  const plugins = [
    ...editorPlugins({ usedLines: (d) => d.childCount, limit: () => limit, onReject }),
  ];
  const state = EditorState.create({ doc, plugins });
  return state.apply(state.tr.setSelection(TextSelection.atEnd(doc)));
}

/** Deletes the last paragraph, joining the caret's end onto the previous one. */
const dropLastParagraph = (state: EditorState): EditorState => {
  const size = state.doc.content.size;
  return state.apply(state.tr.delete(size - state.doc.lastChild!.nodeSize - 1, size));
};

const enter = (state: EditorState): EditorState => {
  let next = state;
  splitParagraph(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
};

describe("capacityPlugin", () => {
  it("drops an edit that would pass the last line and reports it", () => {
    let rejected = 0;
    const state = stateFor("a\nb", 2, () => rejected++);
    const after = enter(state);
    expect(after.doc.childCount).toBe(2);
    expect(after.doc).toBe(state.doc);
    expect(rejected).toBe(1);
    const typed = state.apply(state.tr.insertText("!"));
    expect(typed.doc.textContent).toBe("ab!");
  });

  it("lets text already past the limit be edited as long as it does not grow", () => {
    const state = stateFor("a\nb\nc\nd", 2);
    const shorter = dropLastParagraph(state);
    expect(shorter.doc.childCount).toBe(3);
    expect(enter(shorter).doc.childCount).toBe(3);
    const retyped = shorter.apply(shorter.tr.insertText("x"));
    expect(retyped.doc.textContent).toBe("abcx");
  });

  it("never drops an undo", () => {
    const state = stateFor("a\nb\nc", 3);
    const shorter = dropLastParagraph(state);
    expect(shorter.doc.childCount).toBe(2);
    const stricter = shorter.reconfigure({
      plugins: [
        capacityPlugin({ usedLines: (d) => d.childCount, limit: () => 1 }),
        ...shorter.plugins.slice(1),
      ],
    });
    let undone = stricter;
    undoUnchecked(stricter, (tr) => {
      undone = stricter.apply(tr);
    });
    expect(undone.doc.childCount).toBe(3);
  });
});
