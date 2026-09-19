import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import type { Plugin } from "prosemirror-state";
import {
  insertHardBreak,
  insertTab,
  setAlignment,
  splitParagraph,
  toggleBold,
  toggleHighlight,
  toggleItalic,
} from "./commands";

/**
 * Plugins for one column: the shortcuts and undo history. Nothing is refused: the page
 * is a continuous editor within its bounds (PLAN.md, "the continuous page"); the column
 * measures what the text takes after each change and the page says when it runs past
 * the last rule.
 */
export function editorPlugins(): Plugin[] {
  return [
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
      "Mod-z": undo,
      "Shift-Mod-z": redo,
      "Mod-y": redo,
    }),
    keymap(baseKeymap),
    history(),
  ];
}
