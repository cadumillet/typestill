import { DOMSerializer, type Node as EditorNode } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type Ref,
} from "react";
import type { Column as ColumnValue } from "./document";
import {
  formatCommand,
  formatState,
  parseClipboardText,
  type FormatAction,
  type FormatState,
} from "./editor/commands";
import { editorPlugins } from "./editor/plugins";
import { columnOf, loadColumn, schema } from "./editor/schema";

export interface ColumnHandle {
  /** Applies a formatting action to the selection and returns focus to the column. */
  format: (action: FormatAction) => void;
}

/** A text selection in a focused column: where it is and what formatting it has. */
export interface ColumnSelection {
  /** The selection's first line, in viewport px. */
  top: number;
  bottom: number;
  left: number;
  right: number;
  format: FormatState;
}

export interface ColumnProps {
  value: ColumnValue;
  readOnly: boolean;
  /** Lines the column has, and their height in px. */
  lines: number;
  pitch: number;
  style: CSSProperties;
  onChange: (column: ColumnValue) => void;
  onFull: (full: boolean) => void;
  /** Reported while text is selected in the focused column, null otherwise. */
  onSelection: (selection: ColumnSelection | null) => void;
  ref?: Ref<ColumnHandle>;
}

/**
 * One text column: a ProseMirror editor sized to the column and capped at the page's
 * line count. Paragraphs have zero margin and the rule pitch as line height, so every
 * baseline lands on a rule whatever the formatting. An edit that would push text past
 * the last rule is dropped by the capacity plugin, which measures the candidate document
 * in a hidden mirror laid out like the column.
 *
 * The editor owns the text while editing; the value prop is loaded only when it differs
 * from what the editor last reported.
 */
export function Column({
  value,
  readOnly,
  lines,
  pitch,
  style,
  onChange,
  onFull,
  onSelection,
  ref,
}: ColumnProps) {
  const host = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The editor is created once; its callbacks read the latest props from here.
  const props = useRef({ value, readOnly, lines, pitch, onChange, onFull, onSelection });
  useLayoutEffect(() => {
    props.current = { value, readOnly, lines, pitch, onChange, onFull, onSelection };
  });
  /** The value last reported through onChange. A value prop equal to it needs no reload. */
  const emitted = useRef<ColumnValue | null>(null);
  const dragging = useRef(false);
  const measured = useRef(new WeakMap<EditorNode, number>());

  // These read only refs, so they are stable and safe to close over in the editor.
  const usedLines = useCallback((doc: EditorNode): number => {
    let used = measured.current.get(doc);
    if (used === undefined && mirror.current) {
      used = measureLines(mirror.current, doc, props.current.pitch);
      measured.current.set(doc, used);
    }
    return used ?? 1;
  }, []);

  const reportFull = useCallback(
    (doc: EditorNode) => props.current.onFull(usedLines(doc) >= props.current.lines),
    [usedLines],
  );

  const reportSelection = useCallback(() => {
    const editor = view.current;
    if (!editor) return;
    const { selection } = editor.state;
    if (selection.empty || dragging.current || props.current.readOnly || !editor.hasFocus()) {
      props.current.onSelection(null);
      return;
    }
    const from = editor.coordsAtPos(selection.from);
    const to = editor.coordsAtPos(selection.to);
    const oneLine = Math.abs(from.top - to.top) < 1;
    const box = editor.dom.getBoundingClientRect();
    props.current.onSelection({
      top: from.top,
      bottom: from.bottom,
      left: oneLine ? from.left : box.left,
      right: oneLine ? to.right : box.right,
      format: formatState(editor.state),
    });
  }, []);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const plugins = editorPlugins({
      usedLines,
      limit: () => props.current.lines,
      // A refused paste or keystroke shows the "full" label, so it is not a silent no-op.
      onReject: () => props.current.onFull(true),
    });
    const editor = new EditorView(
      { mount: el },
      {
        state: EditorState.create({ doc: loadColumn(props.current.value), plugins }),
        editable: () => !props.current.readOnly,
        attributes: { spellcheck: "false" },
        clipboardTextParser: parseClipboardText,
        handleDOMEvents: {
          focus: () => {
            reportSelection();
            return false;
          },
          blur: () => {
            props.current.onSelection(null);
            return false;
          },
          // The bar waits until the pointer is released, so it does not chase a drag.
          mousedown: () => {
            dragging.current = true;
            props.current.onSelection(null);
            return false;
          },
        },
        dispatchTransaction: (tr) => {
          const before = editor.state;
          const state = before.apply(tr);
          editor.updateState(state);
          if (state.doc !== before.doc) {
            const column = columnOf(state.doc);
            emitted.current = column;
            props.current.onChange(column);
            reportFull(state.doc);
          }
          reportSelection();
        },
      },
    );
    view.current = editor;
    emitted.current = props.current.value;
    reportFull(editor.state.doc);
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      reportSelection();
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      editor.destroy();
      view.current = null;
      props.current.onSelection(null);
    };
  }, [usedLines, reportFull, reportSelection]);

  // Content set from outside (a divider added or removed) replaces the editor's document.
  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor || value === emitted.current) return;
    const doc = loadColumn(value);
    if (editor.state.doc.eq(doc)) return;
    editor.updateState(EditorState.create({ doc, plugins: editor.state.plugins }));
    emitted.current = value;
    reportFull(doc);
    reportSelection();
  }, [value, reportFull, reportSelection]);

  useEffect(() => {
    view.current?.setProps({ editable: () => !readOnly });
    reportSelection();
  }, [readOnly, reportSelection]);

  // A new zoom or line count changes what fits and where the selection is on screen.
  useEffect(() => {
    measured.current = new WeakMap();
    if (view.current) {
      reportFull(view.current.state.doc);
      reportSelection();
    }
  }, [lines, pitch, style.width, reportFull, reportSelection]);

  useImperativeHandle(
    ref,
    () => ({
      format(action) {
        const editor = view.current;
        if (!editor) return;
        formatCommand(action)(editor.state, editor.dispatch);
        editor.focus();
      },
    }),
    [],
  );

  return (
    <>
      <div ref={host} className="text-page__column" style={style} />
      <div
        ref={mirror}
        className="text-page__mirror"
        style={{ left: style.left, top: style.top, width: style.width }}
        aria-hidden="true"
      />
    </>
  );
}

const serializer = DOMSerializer.fromSchema(schema);

/**
 * Renders a document the way the editor does: an empty paragraph, or one that ends in a
 * hard break, gets a trailing <br> so its last line has a height for the caret to sit in.
 */
function render(doc: EditorNode, document: Document): DocumentFragment {
  const fragment = serializer.serializeFragment(doc.content, { document }) as DocumentFragment;
  doc.forEach((paragraph, _offset, index) => {
    const last = paragraph.lastChild;
    if (!last?.isText || last.text?.endsWith("\n")) {
      fragment.children[index].appendChild(document.createElement("br"));
    }
  });
  return fragment;
}

/** Lines a document takes in the mirror, using the browser's own wrapping. */
function measureLines(mirror: HTMLElement, doc: EditorNode, pitch: number): number {
  mirror.replaceChildren(render(doc, mirror.ownerDocument));
  const height = mirror.getBoundingClientRect().height;
  mirror.replaceChildren();
  return Math.max(1, Math.round(height / pitch));
}
