import { useCallback, useRef, useState, type CSSProperties } from "react";
import { Column } from "./Column";
import { columnFromText, type Column as ColumnValue } from "./document";
import { useBaseline } from "../theme/baseline";
import type { Theme } from "../theme/theme";
import { FormatBar } from "./FormatBar";
import {
  columnBoxes,
  mmToCssPx,
  pageMm,
  ruleCount,
  type Orientation,
  type PageSize,
} from "./paper";
import { pageLookStyle } from "./pageLook";
import { useFormatBar } from "./useFormatBar";
import "./textpage.css";

export interface TextPageProps {
  size: PageSize;
  orientation: Orientation;
  /** The look of the page: font, grid, rules, colours. */
  theme: Theme;
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
 * A lined text page. Each column is an editor in the theme's font whose line height is
 * the rule pitch and whose top is placed so every baseline lands on a rule, using the
 * font's measured baseline. Input that would push text past the last rule is rejected.
 * A selection gets a floating format bar.
 */
export function TextPage({
  size,
  orientation,
  theme,
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
  const { lined } = theme;
  const lines = ruleCount(mm.height, lined);
  const pitch = px(lined.pitchMm);
  const ruleTop = px(lined.firstRuleMm);
  const fontSize = pitch / lined.font.lineHeight;
  const baseline = useBaseline(lined.font, fontSize, pitch);
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
    ...pageLookStyle(theme, lined.font, zoom),
    width: px(mm.width),
    height: px(mm.height),
    "--rule-pitch": `${pitch}px`,
    "--rule-top": `${ruleTop}px`,
    "--rules-height": `${(lines - 1) * pitch + 1}px`,
    "--margin-left": `${px(margin)}px`,
    "--font-size": `${fontSize}px`,
  } as CSSProperties;

  const boxes = columnBoxes(mm.width, margin, divider, lined);
  const locked = preview || readOnly;
  const className = [
    "text-page",
    `rules-${lined.rules}`,
    lined.marginLine ? "has-margin-line" : "",
    theme.page.border ? "has-border" : "",
    preview ? "is-preview" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} style={style} ref={page}>
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
            top: ruleTop - baseline,
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
