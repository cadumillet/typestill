import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Column } from "./Column";
import { columnFromText, type Column as ColumnValue } from "./document";
import { useBaseline } from "../theme/baseline";
import type { Theme } from "../theme/theme";
import { isDarkTheme } from "../theme/themes";
import type { DrawingLayer } from "../store/model";
import { DrawingStill } from "./DrawingStill";
import { drawingModeStyle, type DrawingAids } from "./drawingMode";
import { FormatBar } from "./FormatBar";
import { PageMarks } from "./PageMarks";
import {
  SCENE_PX_PER_MM,
  columnBoxes,
  mmToCssPx,
  pageMm,
  ruleCount,
  snapDivider,
  type Orientation,
  type PageSize,
} from "./paper";
import { pageLookStyle } from "./pageLook";
import type { PageSide } from "./sides";
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
  /** The page number at the bottom centre, when the page shows one. */
  number?: number | null;
  /** The page's side, which rounds its outer corners; none for a rectangular render. */
  side?: PageSide;
  /** The page's drawing, shown as a still over or under the text; empty for none. */
  drawing?: readonly ExcalidrawElement[];
  drawingLayer?: DrawingLayer;
  /** The notebook's files, for the images the drawing uses. */
  files?: BinaryFiles;
  /**
   * Drawing mode, with its viewing aids: the page is locked, its text and rules take the
   * aids' opacity, and no still is shown (the live editor is over the page).
   */
  drawingMode?: DrawingAids | null;
  onChange?: (columns: ColumnValue[]) => void;
  /** The divider was dragged to a new offset (already snapped), in mm. */
  onDividerChange?: (divider: number) => void;
}

const NO_ELEMENTS: readonly ExcalidrawElement[] = [];
const NO_FILES: BinaryFiles = {};

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
  number = null,
  side,
  drawing = NO_ELEMENTS,
  drawingLayer = "over",
  files = NO_FILES,
  drawingMode = null,
  onChange,
  onDividerChange,
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
  /** Where the divider is while it is being dragged, in mm; null otherwise. */
  const [dragDivider, setDragDivider] = useState<number | null>(null);

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
    ...(drawingMode ? drawingModeStyle(drawingMode) : {}),
  } as CSSProperties;

  const locked = preview || readOnly || drawingMode !== null;
  const shownDivider = dragDivider ?? divider;
  const boxes = columnBoxes(mm.width, margin, shownDivider, lined);

  // The divider is dragged in 10mm steps; the columns follow live and the new offset is
  // reported once the pointer is released.
  const dividerAt = (event: PointerEvent) => {
    const box = page.current?.getBoundingClientRect();
    if (!box) return null;
    const at = (event.clientX - box.left) / zoom / SCENE_PX_PER_MM;
    return snapDivider(at, mm.width, margin, lined);
  };
  const onDividerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (locked || event.button !== 0 || divider === null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragDivider(divider);
  };
  const onDividerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragDivider === null) return;
    const at = dividerAt(event);
    if (at !== null && at !== dragDivider) setDragDivider(at);
  };
  const onDividerUp = () => {
    if (dragDivider === null) return;
    setDragDivider(null);
    if (dragDivider !== divider) onDividerChange?.(dragDivider);
  };
  const className = [
    "text-page",
    `rules-${lined.rules}`,
    lined.marginLine ? "has-margin-line" : "",
    theme.page.border ? "has-border" : "",
    preview ? "is-preview" : "",
    side ? `side-${side}` : "",
    drawingMode ? "is-drawing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`${className}${dragDivider !== null ? " is-dragging-divider" : ""}`}
      style={style}
      ref={page}
    >
      {!drawingMode && (
        <DrawingStill
          elements={drawing}
          files={files}
          size={size}
          orientation={orientation}
          layer={drawingLayer}
          inverted={isDarkTheme(theme)}
          width={px(mm.width)}
          height={px(mm.height)}
        />
      )}
      {shownDivider !== null && !locked && (
        <div
          className="text-page__divider-handle"
          style={{ left: px(shownDivider) }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Divider"
          aria-valuenow={Math.round(shownDivider)}
          title="Drag to move the divider"
          onPointerDown={onDividerDown}
          onPointerMove={onDividerMove}
          onPointerUp={onDividerUp}
          onPointerCancel={onDividerUp}
        />
      )}
      {shownDivider !== null && (
        <div className="text-page__divider" style={{ left: px(shownDivider) }} aria-hidden="true" />
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
      <PageMarks number={number} zoom={zoom} />
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
