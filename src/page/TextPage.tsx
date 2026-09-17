import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  RULE_PITCH_MM,
  RULE_TOP_MM,
  TEXT_BASELINE,
  TEXT_LINE_HEIGHT,
  columnBoxes,
  mmToCssPx,
  pageMm,
  ruleCount,
  type Orientation,
  type PageSize,
} from "./paper";
import "./textpage.css";

export interface TextPageProps {
  size: PageSize;
  orientation: Orientation;
  /** CSS px per scene px. Sets the rendered size of the page. */
  zoom: number;
  /** Margin line offset in mm from the left edge. */
  margin: number;
  /** One or two plain-text columns. */
  columns: readonly string[];
  /** Divider offset in mm from the left edge, null for one column. */
  divider: number | null;
  /** Preview: no rules, margin or divider, and no editing. */
  preview?: boolean;
  readOnly?: boolean;
  onChange?: (columns: string[]) => void;
}

/**
 * A lined text page. Each column is a plain-text editable block in Excalifont whose line
 * height is the rule pitch and whose top is placed so every baseline lands on a rule.
 * Input that would push text past the last rule is rejected.
 */
export function TextPage({
  size,
  orientation,
  zoom,
  margin,
  columns,
  divider,
  preview = false,
  readOnly = false,
  onChange,
}: TextPageProps) {
  const mm = pageMm(size, orientation);
  const px = (value: number) => mmToCssPx(value, zoom);
  const lines = ruleCount(mm.height);
  const pitch = px(RULE_PITCH_MM);
  const ruleTop = px(RULE_TOP_MM);
  const [fullColumns, setFullColumns] = useState<boolean[]>([]);
  const setColumnFull = useCallback((index: number, full: boolean) => {
    setFullColumns((current) => {
      if (current[index] === full) return current;
      const next = [...current];
      next[index] = full;
      return next;
    });
  }, []);

  const style = {
    width: px(mm.width),
    height: px(mm.height),
    "--rule-pitch": `${pitch}px`,
    "--rule-top": `${ruleTop}px`,
    "--rules-height": `${(lines - 1) * pitch + 1}px`,
    "--margin-left": `${px(margin)}px`,
    "--font-size": `${pitch / TEXT_LINE_HEIGHT}px`,
  } as CSSProperties;

  const boxes = columnBoxes(mm.width, margin, divider);
  const locked = preview || readOnly;

  return (
    <div className={`text-page${preview ? " is-preview" : ""}`} style={style}>
      {divider !== null && (
        <div className="text-page__divider" style={{ left: px(divider) }} aria-hidden="true" />
      )}
      {boxes.map((box, index) => (
        <Column
          key={index}
          value={columns[index] ?? ""}
          readOnly={locked}
          lines={lines}
          pitch={pitch}
          style={{
            left: px(box.left),
            width: px(box.width),
            top: ruleTop - pitch * TEXT_BASELINE,
            height: lines * pitch,
          }}
          onChange={(text) => {
            const next = [...columns];
            next[index] = text;
            onChange?.(next);
          }}
          onFull={(full) => setColumnFull(index, full)}
        />
      ))}
      {!locked &&
        boxes.map(
          (box, index) =>
            fullColumns[index] && (
              <div
                key={index}
                className="text-page__full"
                style={{ left: px(box.left), width: px(box.width) }}
              >
                {boxes.length > 1 ? "Column full" : "Page full"}
              </div>
            ),
        )}
    </div>
  );
}

interface ColumnProps {
  value: string;
  readOnly: boolean;
  lines: number;
  pitch: number;
  style: CSSProperties;
  onChange: (text: string) => void;
  onFull: (full: boolean) => void;
}

/**
 * One text column: a plain-text contenteditable block sized to the column and capped
 * at the page's line count. A contenteditable rather than a text area so that, later,
 * text can wrap around images floated inside the column.
 *
 * The DOM owns the text while editing; the value prop is written only when it differs.
 * Line breaks always go through the browser's "insert line break" command, which keeps
 * the DOM plain text (Enter would otherwise create block elements). Chrome keeps a
 * placeholder newline after a trailing one so the caret can rest on an empty last
 * line; readText and writeText translate that to and from the stored value.
 */
function Column({ value, readOnly, lines, pitch, style, onChange, onFull }: ColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  // True while this component inserts text itself, so its own edits are not intercepted.
  const inserting = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && readText(el) !== value) writeText(el, value);
  }, [value]);

  // Text set from outside (page switch, undo) may itself fill the page.
  useEffect(() => {
    const el = ref.current;
    if (el) onFull(countLines(el, pitch) >= lines);
  }, [value, lines, pitch, onFull]);

  // Reject, before it happens, any edit that would push text past the last rule.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wouldOverflow = (data: string) => {
      const mirror = mirrorRef.current;
      const range = selectionOffsets(el);
      if (!mirror || !range) return false;
      const text = readText(el);
      const candidate = text.slice(0, range.start) + data + text.slice(range.end);
      mirror.textContent = candidate.endsWith("\n") ? candidate + "\n" : candidate;
      const used = Math.max(1, Math.round(mirror.scrollHeight / pitch));
      mirror.textContent = "";
      return used > lines;
    };
    const onBeforeInput = (event: InputEvent) => {
      if (inserting.current) return;
      let data: string | null;
      switch (event.inputType) {
        case "insertParagraph":
        case "insertLineBreak":
          data = "\n";
          break;
        case "insertText":
        case "insertReplacementText":
          data = event.data;
          break;
        case "insertFromPaste":
        case "insertFromDrop":
          data = event.dataTransfer?.getData("text/plain") ?? null;
          break;
        default:
          return; // deletions, formatting attempts and composition: nothing to reject
      }
      if (data === null) return;
      if (wouldOverflow(data)) {
        event.preventDefault();
        onFull(true);
        return;
      }
      // Anything with a line break is inserted by hand so the DOM stays plain text.
      if (data.includes("\n")) {
        event.preventDefault();
        inserting.current = true;
        try {
          insertPlainText(data);
        } finally {
          inserting.current = false;
        }
      }
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, [lines, pitch, onFull]);

  return (
    <>
      <div
        ref={ref}
        className={`text-page__column${readOnly ? " is-readonly" : ""}`}
        style={style}
        contentEditable={readOnly ? false : "plaintext-only"}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={() => {
          const el = ref.current;
          if (!el) return;
          // Edits that could not be rejected up front (composition) are undone after.
          if (countLines(el, pitch) > lines) document.execCommand("undo");
          onChange(readText(el));
          onFull(countLines(el, pitch) >= lines);
        }}
      />
      <div
        ref={mirrorRef}
        className="text-page__mirror"
        style={{ left: style.left, top: style.top, width: style.width }}
        aria-hidden="true"
      />
    </>
  );
}

/** The stored value of a column: the DOM text without Chrome's trailing placeholder newline. */
function readText(el: HTMLElement): string {
  return el.innerText.replace(/\n$/, "");
}

/** Puts a value in the DOM, adding the placeholder newline a trailing newline needs to render. */
function writeText(el: HTMLElement, value: string): void {
  el.textContent = value.endsWith("\n") ? value + "\n" : value;
}

/** Inserts text at the selection line by line, so newlines never become block elements. */
function insertPlainText(text: string): void {
  const parts = text.split("\n");
  parts.forEach((part, index) => {
    if (index > 0) document.execCommand("insertLineBreak");
    if (part) document.execCommand("insertText", false, part);
  });
}

/** Character offsets of the selection within the element's text, or null if it is elsewhere. */
function selectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
  const offsetOf = (node: Node, offset: number) => {
    const probe = document.createRange();
    probe.setStart(el, 0);
    probe.setEnd(node, offset);
    return probe.toString().length;
  };
  return {
    start: offsetOf(range.startContainer, range.startOffset),
    end: offsetOf(range.endContainer, range.endOffset),
  };
}

/**
 * Lines the text occupies, using the browser's own wrapping. The box reports its content
 * height through scrollHeight only when it is shorter than the content, so it is
 * collapsed for the measurement and restored right after.
 */
function countLines(el: HTMLElement, pitch: number): number {
  const height = el.style.height;
  el.style.height = "0px";
  const used = Math.round(el.scrollHeight / pitch);
  el.style.height = height;
  return Math.max(1, used);
}
