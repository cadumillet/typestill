import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HIGHLIGHT_TINTS, INK_COLORS } from "../canvas/palette";
import { IconButton } from "../shell/IconButton";
import { keyLabel } from "../shell/keys";
import { AlignCenter, AlignLeft, AlignRight, Bold, Highlighter, Italic } from "../shell/icons";
import { ALIGNMENTS, type Alignment } from "./document";
import type { FormatAction, FormatState } from "./editor/commands";
import "./formatbar.css";

export interface FormatBarProps {
  /** The selection's first line, in px from the page's top left corner. */
  anchor: { top: number; bottom: number; left: number; right: number };
  /** The page's size, to keep the bar inside it. */
  bounds: { width: number; height: number };
  format: FormatState;
  onAction: (action: FormatAction) => void;
}

const GAP = 6;
const INSET = 4;
const shortcut = (key: string, shift = false) => keyLabel({ mod: true, shift, key });

const ALIGNMENT_ICONS: Record<Alignment, { label: string; key: string; icon: () => ReactNode }> = {
  left: { label: "Align left", key: "L", icon: AlignLeft },
  center: { label: "Align centre", key: "E", icon: AlignCenter },
  right: { label: "Align right", key: "R", icon: AlignRight },
};

/**
 * The floating bar over a text selection: bold, italic, the ink palette, the highlighter
 * with its tints, and the three alignments. It sits above the selection's first line, or
 * below it when there is no room, and never leaves the page. Its buttons keep the
 * editor's focus and selection.
 */
export function FormatBar({ anchor, bounds, format, onAction }: FormatBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setSize({ width: el.offsetWidth, height: el.offsetHeight });
  }, []);

  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  const centre = (anchor.left + anchor.right) / 2;
  const left = Math.min(
    Math.max(centre - width / 2, INSET),
    Math.max(INSET, bounds.width - width - INSET),
  );
  const above = anchor.top - GAP - height;
  const top = above >= INSET ? above : anchor.bottom + GAP;
  const style: CSSProperties = { left, top, visibility: size ? "visible" : "hidden" };

  return (
    <div
      ref={ref}
      className="format-bar"
      role="toolbar"
      aria-label="Formatting"
      style={style}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="format-bar__group">
        <IconButton
          label="Bold"
          shortcut={shortcut("B")}
          pressed={format.bold}
          onClick={() => onAction({ type: "bold" })}
        >
          <Bold />
        </IconButton>
        <IconButton
          label="Italic"
          shortcut={shortcut("I")}
          pressed={format.italic}
          onClick={() => onAction({ type: "italic" })}
        >
          <Italic />
        </IconButton>
      </div>
      <div className="format-bar__group">
        {INK_COLORS.map((color) => (
          <button
            key={color.name}
            type="button"
            className="format-bar__swatch"
            style={{ background: color.value ?? "var(--page-ink)" }}
            aria-label={color.name}
            aria-pressed={format.color === color.value}
            data-tooltip={color.name}
            onClick={() => onAction({ type: "color", color: color.value })}
          />
        ))}
      </div>
      <div className="format-bar__group">
        <IconButton
          label="Highlight"
          shortcut={shortcut("H", true)}
          pressed={format.highlight !== null}
          onClick={() => onAction({ type: "highlighter" })}
        >
          <Highlighter />
        </IconButton>
        {HIGHLIGHT_TINTS.map(({ tint, name }) => (
          <button
            key={tint}
            type="button"
            className="format-bar__swatch format-bar__swatch--tint"
            style={{
              backgroundImage: `linear-gradient(var(--page-highlight-${tint}), var(--page-highlight-${tint}))`,
            }}
            aria-label={`${name} highlight`}
            aria-pressed={format.highlight === tint}
            data-tooltip={name}
            onClick={() => onAction({ type: "highlight", tint })}
          />
        ))}
        <button
          type="button"
          className="format-bar__swatch format-bar__swatch--none"
          aria-label="No highlight"
          aria-pressed={format.highlight === null}
          data-tooltip="None"
          onClick={() => onAction({ type: "highlight", tint: null })}
        />
      </div>
      <div className="format-bar__group">
        {ALIGNMENTS.map((align) => {
          const { label, key, icon: Icon } = ALIGNMENT_ICONS[align];
          return (
            <IconButton
              key={align}
              label={label}
              shortcut={shortcut(key, true)}
              pressed={format.align === align}
              onClick={() => onAction({ type: "align", align })}
            >
              <Icon />
            </IconButton>
          );
        })}
      </div>
    </div>
  );
}
