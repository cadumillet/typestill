import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useElementSize } from "../page/useElementSize";
import "./split.css";

export interface SplitViewProps {
  /** The main column: app bar and content. Always visible. */
  main: ReactNode;
  /** The side panel on the right. */
  panel: ReactNode;
  panelOpen: boolean;
  /** Requested panel width in px. Clamped to the minimums. */
  panelWidth: number;
  onPanelWidthChange: (width: number) => void;
  minMain?: number;
  minPanel?: number;
}

const HANDLE_WIDTH = 12;

/** A main column with a resizable side panel on the right, like a chat with an open artifact. */
export function SplitView({
  main,
  panel,
  panelOpen,
  panelWidth,
  onPanelWidthChange,
  minMain = 320,
  minPanel = 320,
}: SplitViewProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const total = size?.width ?? 0;
  const maxPanel = Math.max(minPanel, total - HANDLE_WIDTH - minMain);
  const width = Math.min(Math.max(panelWidth, minPanel), maxPanel);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onPanelWidthChange(drag.current.startWidth - (event.clientX - drag.current.startX));
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div ref={ref} className={`split${dragging ? " is-dragging" : ""}`}>
      <div className="split__main">{main}</div>
      {panelOpen && (
        <>
          <div
            className="split__handle"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          <div className="split__panel" style={{ width }}>
            {panel}
          </div>
        </>
      )}
    </div>
  );
}
