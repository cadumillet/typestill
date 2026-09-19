import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import type { Node as EditorNode } from "prosemirror-model";
import { Plugin, PluginKey, type Command } from "prosemirror-state";
import {
  insertHardBreak,
  insertTab,
  setAlignment,
  splitParagraph,
  toggleBold,
  toggleHighlight,
  toggleItalic,
} from "./commands";

export interface CapacityOptions {
  /** Lines a document takes, measured with the column's width and font. */
  usedLines: (doc: EditorNode) => number;
  /** Lines the column has. */
  limit: () => number;
  /** Called when an edit is dropped for not fitting. */
  onReject?: () => void;
}

const capacityKey = new PluginKey("capacity");

/**
 * The page's hard stop: an edit that would push text past the last rule is dropped.
 * Text already past it (after a page size change, say) can still be edited as long as
 * the edit does not make it longer. Undo and redo are never dropped: they only return
 * to states the page has already been in.
 */
export function capacityPlugin({ usedLines, limit, onReject }: CapacityOptions): Plugin {
  return new Plugin({
    key: capacityKey,
    filterTransaction(tr, state) {
      if (!tr.docChanged || tr.getMeta(capacityKey) === "unchecked") return true;
      const used = usedLines(tr.doc);
      if (used <= limit() || used <= usedLines(state.doc)) return true;
      onReject?.();
      return false;
    },
  });
}

/** A command whose transactions bypass the capacity check. */
function unchecked(command: Command): Command {
  return (state, dispatch, view) =>
    command(state, dispatch && ((tr) => dispatch(tr.setMeta(capacityKey, "unchecked"))), view);
}

export const undoUnchecked: Command = unchecked(undo);
export const redoUnchecked: Command = unchecked(redo);

/** Plugins for one column: the capacity guard, the shortcuts and undo history. */
export function editorPlugins(capacity: CapacityOptions): Plugin[] {
  return [
    capacityPlugin(capacity),
    keymap({
      "Mod-b": toggleBold,
      "Mod-i": toggleItalic,
      "Mod-Shift-h": toggleHighlight,
      "Mod-Shift-l": setAlignment("left"),
      "Mod-Shift-e": setAlignment("center"),
      "Mod-Shift-r": setAlignment("right"),
      Enter: splitParagraph,
      "Shift-Enter": insertHardBreak,
      Tab: insertTab,
      "Mod-z": undoUnchecked,
      "Shift-Mod-z": redoUnchecked,
      "Mod-y": redoUnchecked,
    }),
    keymap(baseKeymap),
    history(),
  ];
}
