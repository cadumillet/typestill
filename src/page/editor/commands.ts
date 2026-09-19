// Formatting commands. Alignment is a paragraph property, as in Google Docs: it applies
// to every paragraph a selection touches, wrapped lines and hard breaks included. Enter
// splits the paragraph and the new one keeps the alignment.

import { splitBlockAs, toggleMark } from "prosemirror-commands";
import { Fragment, Slice, type Mark, type ResolvedPos } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import { DEFAULT_ALIGNMENT, type Alignment, type Tint } from "../document";
import { schema } from "./schema";

export type FormatAction =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "color"; color: string | null }
  /** A tint from the swatches, or null for no highlight. */
  | { type: "highlight"; tint: Tint | null }
  /** The highlighter button and its shortcut: the last tint used, or off. */
  | { type: "highlighter" }
  | { type: "align"; align: Alignment };

/** What the selection has, for the format bar. */
export interface FormatState {
  bold: boolean;
  italic: boolean;
  /** The colour at the start of the selection, null for the default ink. */
  color: string | null;
  /** The highlight tint at the start of the selection, null for none. */
  highlight: Tint | null;
  align: Alignment;
}

export const toggleBold: Command = toggleMark(schema.marks.bold);
export const toggleItalic: Command = toggleMark(schema.marks.italic);

/** Colours the selection, or the text typed next when it is empty. Null restores the ink. */
export function setColor(color: string | null): Command {
  return (state, dispatch) => {
    const type = schema.marks.color;
    const tr = state.tr;
    if (state.selection.empty) {
      if (color) tr.addStoredMark(type.create({ color }));
      else tr.removeStoredMark(type);
    } else {
      for (const { $from, $to } of state.selection.ranges) {
        if (color) tr.addMark($from.pos, $to.pos, type.create({ color }));
        else tr.removeMark($from.pos, $to.pos, type);
      }
    }
    dispatch?.(tr);
    return true;
  };
}

/** The tint the highlighter button applies: the last one picked, yellow to begin with. */
let lastTint: Tint = "yellow";

export const lastHighlightTint = (): Tint => lastTint;

/** Whether the whole selection (or the caret's marks) carries the highlight, of `tint` if given. */
function hasHighlight(state: EditorState, tint?: Tint): boolean {
  const type = schema.marks.highlight;
  const matches = (marks: readonly Mark[]) => {
    const mark = type.isInSet(marks);
    return !!mark && (tint === undefined || mark.attrs.tint === tint);
  };
  const { $from, from, to, empty } = state.selection;
  if (empty) return matches(state.storedMarks ?? $from.marks());
  let all = true;
  let any = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    any = true;
    if (!matches(node.marks)) all = false;
  });
  return any && all;
}

/**
 * Highlights the selection, or the text typed next when it is empty, with a tint; the
 * same tint on a run that already has it takes the highlight off. Null takes it off too.
 */
export function setHighlight(tint: Tint | null): Command {
  return (state, dispatch) => {
    const type = schema.marks.highlight;
    const remove = tint === null || hasHighlight(state, tint);
    if (tint) lastTint = tint;
    const tr = state.tr;
    if (state.selection.empty) {
      if (remove) tr.removeStoredMark(type);
      else tr.addStoredMark(type.create({ tint }));
    } else {
      for (const { $from, $to } of state.selection.ranges) {
        if (remove) tr.removeMark($from.pos, $to.pos, type);
        else tr.addMark($from.pos, $to.pos, type.create({ tint }));
      }
    }
    dispatch?.(tr);
    return true;
  };
}

/** The highlighter: off on a highlighted run, else the last tint used. */
export const toggleHighlight: Command = (state, dispatch) =>
  setHighlight(hasHighlight(state) ? null : lastTint)(state, dispatch);

/** Aligns every paragraph the selection touches. */
export function setAlignment(align: Alignment): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    for (const { $from, $to } of state.selection.ranges) {
      state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
        if (node.type !== schema.nodes.paragraph) return true;
        if (node.attrs.align !== align) tr.setNodeMarkup(pos, null, { ...node.attrs, align });
        return false;
      });
    }
    if (tr.docChanged) dispatch?.(tr);
    return true;
  };
}

/** Enter: a new paragraph with the same alignment, keeping the marks being typed with. */
export const splitParagraph: Command = (state, dispatch) => {
  const marks =
    state.storedMarks ?? (state.selection.$to.parentOffset ? state.selection.$from.marks() : null);
  return splitBlockAs((node, atEnd) => (atEnd ? { type: node.type, attrs: node.attrs } : null))(
    state,
    dispatch && ((tr) => dispatch(marks ? tr.ensureMarks(marks) : tr)),
  );
};

/** Shift+Enter: a line break inside the paragraph. */
export const insertHardBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
  return true;
};

/** What Tab inserts: four spaces, not a tab character, so plain text reads the same everywhere. */
export const TAB_SPACES = "    ";

/** Tab: four spaces in place of the selection, keeping the stored marks; the key is used up. */
export const insertTab: Command = (state, dispatch) => {
  dispatch?.(state.tr.insertText(TAB_SPACES).scrollIntoView());
  return true;
};

export function formatCommand(action: FormatAction): Command {
  switch (action.type) {
    case "bold":
      return toggleBold;
    case "italic":
      return toggleItalic;
    case "color":
      return setColor(action.color);
    case "highlight":
      return setHighlight(action.tint);
    case "highlighter":
      return toggleHighlight;
    case "align":
      return setAlignment(action.align);
  }
}

export function formatState(state: EditorState): FormatState {
  const { $from, from, to, empty } = state.selection;
  const marks = empty ? (state.storedMarks ?? $from.marks()) : ($from.nodeAfter?.marks ?? []);
  const hasMark = (name: "bold" | "italic") =>
    empty
      ? !!schema.marks[name].isInSet(marks)
      : state.doc.rangeHasMark(from, to, schema.marks[name]);
  const color = schema.marks.color.isInSet(marks);
  const highlight = schema.marks.highlight.isInSet(marks);
  return {
    bold: hasMark("bold"),
    italic: hasMark("italic"),
    color: color ? (color.attrs.color as string) : null,
    highlight: highlight ? (highlight.attrs.tint as Tint) : null,
    align: ($from.parent.attrs.align as Alignment | undefined) ?? DEFAULT_ALIGNMENT,
  };
}

/**
 * Pasted plain text: one paragraph per line, blank lines included, taking the alignment
 * of the paragraph pasted into and the marks at the caret.
 */
export function parseClipboardText(text: string, $context: ResolvedPos): Slice {
  const marks = $context.marks();
  const align = ($context.parent.attrs.align as Alignment | undefined) ?? DEFAULT_ALIGNMENT;
  const paragraphs = text
    .split(/\r\n?|\n/)
    .map((line) =>
      schema.nodes.paragraph.create({ align }, line ? schema.text(line, marks) : null),
    );
  return new Slice(Fragment.from(paragraphs), 1, 1);
}
