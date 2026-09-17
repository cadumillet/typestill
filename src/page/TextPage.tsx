import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
  /** Clear view: no rules, margin or divider, and no editing. */
  clear?: boolean;
  readOnly?: boolean;
  onChange?: (columns: string[]) => void;
}

/**
 * A lined text page. Each column is a plain text area in Excalifont whose line height
 * is the rule pitch and whose top is placed so every baseline lands on a rule. Input
 * that would push text past the last rule is rejected.
 */
export function TextPage({
  size,
  orientation,
  zoom,
  margin,
  columns,
  divider,
  clear = false,
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
  const locked = clear || readOnly;

  return (
    <div className={`text-page${clear ? " is-clear" : ""}`} style={style}>
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

/** One text column: a text area sized to the column, capped at the page's line count. */
function Column({ value, readOnly, lines, pitch, style, onChange, onFull }: ColumnProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Selection before the last edit, to put the caret back when an edit is rejected.
  const selection = useRef({ start: 0, end: 0 });

  // Text set from outside (page switch, undo) may itself fill the page.
  useEffect(() => {
    const el = ref.current;
    if (el) onFull(countLines(el, pitch) >= lines);
  }, [value, lines, pitch, onFull]);

  return (
    <textarea
      ref={ref}
      className="text-page__column"
      style={style}
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      wrap="soft"
      onBeforeInput={(event) => {
        const el = event.currentTarget;
        selection.current = { start: el.selectionStart, end: el.selectionEnd };
      }}
      onChange={(event) => {
        const el = event.currentTarget;
        if (countLines(el, pitch) > lines) {
          // Reject: React restores the previous value after this handler; restore the
          // caret once it has.
          const { start, end } = selection.current;
          requestAnimationFrame(() => el.setSelectionRange(start, end));
          onFull(true);
          return;
        }
        onChange(el.value);
      }}
    />
  );
}

/**
 * Lines the text occupies, using the browser's own wrapping. A text area reports its
 * content height through scrollHeight only when the box is shorter than the content,
 * so the box is collapsed for the measurement and restored right after.
 */
function countLines(el: HTMLTextAreaElement, pitch: number): number {
  const height = el.style.height;
  el.style.height = "0px";
  const used = Math.round(el.scrollHeight / pitch);
  el.style.height = height;
  return Math.max(1, used);
}
