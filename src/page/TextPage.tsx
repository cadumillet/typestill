import { useCallback, useRef, useState, type CSSProperties } from "react";
import { Column } from "./Column";
import { columnFromText, type Column as ColumnValue } from "./document";
import { FormatBar } from "./FormatBar";
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
import { useFormatBar } from "./useFormatBar";
import "./textpage.css";

export interface TextPageProps {
  size: PageSize;
  orientation: Orientation;
  /** CSS px per scene px. Sets the rendered size of the page. */
  zoom: number;
  /** Margin line offset in mm from the left edge. */
  margin: number;
  /** One or two columns. */
  columns: readonly ColumnValue[];
  /** Divider offset in mm from the left edge, null for one column. */
  divider: number | null;
  /** Preview: no rules, margin or divider, and no editing. */
  preview?: boolean;
  readOnly?: boolean;
  onChange?: (columns: ColumnValue[]) => void;
}

const EMPTY_COLUMN = columnFromText("");

/**
 * A lined text page. Each column is an editor in Excalifont whose line height is the
 * rule pitch and whose top is placed so every baseline lands on a rule. Input that would
 * push text past the last rule is rejected. A selection gets a floating format bar.
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
  const page = useRef<HTMLDivElement>(null);
  const bar = useFormatBar(page);
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
    <div className={`text-page${preview ? " is-preview" : ""}`} style={style} ref={page}>
      {divider !== null && (
        <div className="text-page__divider" style={{ left: px(divider) }} aria-hidden="true" />
      )}
      {boxes.map((box, index) => (
        <Column
          key={index}
          ref={bar.bindEditor(index)}
          value={columns[index] ?? EMPTY_COLUMN}
          readOnly={locked}
          lines={lines}
          pitch={pitch}
          style={{
            left: px(box.left),
            width: px(box.width),
            top: ruleTop - pitch * TEXT_BASELINE,
            height: lines * pitch,
          }}
          onChange={(column) => {
            const next = [...columns];
            next[index] = column;
            onChange?.(next);
          }}
          onFull={(full) => setColumnFull(index, full)}
          onSelection={(at) => bar.setColumnSelection(index, at)}
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
      {!locked && bar.selection && (
        <FormatBar
          anchor={bar.selection.anchor}
          bounds={{ width: px(mm.width), height: px(mm.height) }}
          format={bar.selection.format}
          onAction={bar.onAction}
        />
      )}
    </div>
  );
}
