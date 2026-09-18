import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { focusContextOf } from "../shell/useShortcuts";
import { readStroke, type DrawingStroke } from "./drawingMode";
import { PAGE_BORDER_PX } from "./pageLook";
import { isDrag, snapTo15, toScene, type Point, type QuickLine } from "./quickLine";

export interface QuickLinePreview {
  /** The drag so far, in page px from the padding box's origin, the end snapped. */
  start: Point;
  end: Point;
  /** The stroke the line will have, for the preview to match. */
  stroke: DrawingStroke;
}

export interface QuickLineHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

export interface QuickLineState {
  /** Shift is held: the page takes the pointer for a line and shows a crosshair. */
  armed: boolean;
  /** A line being dragged past the dead zone, or null. */
  preview: QuickLinePreview | null;
  /** For the page element. */
  handlers: QuickLineHandlers;
}

export interface UseQuickLineOptions {
  /** The page is the open one in writing mode with nothing over it; off, nothing arms. */
  enabled: boolean;
  /** CSS px per scene px, for the line's scene coordinates. */
  zoom: number;
  /** A line drawn, in scene px. */
  onLine: (line: QuickLine) => void;
}

interface Drag {
  pointerId: number;
  start: Point;
  end: Point;
  stroke: DrawingStroke;
}

/** Whether the focus is somewhere Shift belongs to: a native field or a dialog. */
const focusTaken = (): boolean => {
  const context = focusContextOf(document.activeElement);
  return context.inNativeField || context.inDialog;
};

/**
 * The quick line: a line drawn on the open page without leaving writing. Shift held arms
 * the page (keydown without repeat, when no pointer button is down and the focus is not
 * in a native field or a dialog); Shift keyup, window blur, the document hidden, Tab,
 * Escape, a focus change into a field or dialog, or the hook being disabled disarm. No
 * key event is ever stopped: Shift+letter types a capital, Shift+arrows extend the
 * selection and Shift+Tab goes on to toggle drawing mode. Armed, the page's writing and
 * chrome take no pointer (quickline.css) and a pointer down on the page captures the
 * pointer and drags a line whose end snaps to 15° steps from the start; past the dead
 * zone a preview shows, and on release the line is reported in scene px, a shorter drag
 * being nothing. Shift released mid-drag disarms but the drag finishes; Escape cancels it;
 * other pointers are ignored.
 */
export function useQuickLine(
  page: RefObject<HTMLElement | null>,
  { enabled, zoom, onLine }: UseQuickLineOptions,
): QuickLineState {
  const [armed, setArmed] = useState(false);
  const [preview, setPreview] = useState<QuickLinePreview | null>(null);
  const drag = useRef<Drag | null>(null);
  /** Pointer buttons down anywhere in the document: a selection in progress must not be interrupted. */
  const buttonsDown = useRef(0);
  const latest = useRef({ zoom, onLine });
  useEffect(() => {
    latest.current = { zoom, onLine };
  }, [zoom, onLine]);

  const cancel = useCallback(() => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setPreview(null);
    try {
      page.current?.releasePointerCapture(current.pointerId);
    } catch {
      // The pointer was never captured (synthetic events); nothing to release.
    }
  }, [page]);

  // Disabling (the page locked, something opened over it, the page left) disarms in
  // the cleanup, since the Shift keyup may never be seen.
  useEffect(() => {
    if (!enabled) return;
    const disarm = () => setArmed(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        if (!event.repeat && buttonsDown.current === 0 && !focusTaken()) setArmed(true);
      } else if (event.key === "Tab") {
        disarm();
      } else if (event.key === "Escape") {
        cancel();
        disarm();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") disarm();
    };
    const onBlur = () => {
      disarm();
      cancel();
    };
    const onVisibility = () => {
      if (document.hidden) onBlur();
    };
    const onFocusIn = () => {
      if (focusTaken()) disarm();
    };
    const onPointerDown = () => {
      buttonsDown.current += 1;
    };
    const onPointerUp = () => {
      buttonsDown.current = Math.max(0, buttonsDown.current - 1);
    };
    const capture = { capture: true } as const;
    document.addEventListener("keydown", onKeyDown, capture);
    document.addEventListener("keyup", onKeyUp, capture);
    document.addEventListener("focusin", onFocusIn, capture);
    document.addEventListener("pointerdown", onPointerDown, capture);
    document.addEventListener("pointerup", onPointerUp, capture);
    document.addEventListener("pointercancel", onPointerUp, capture);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown, capture);
      document.removeEventListener("keyup", onKeyUp, capture);
      document.removeEventListener("focusin", onFocusIn, capture);
      document.removeEventListener("pointerdown", onPointerDown, capture);
      document.removeEventListener("pointerup", onPointerUp, capture);
      document.removeEventListener("pointercancel", onPointerUp, capture);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      buttonsDown.current = 0;
      disarm();
      cancel();
    };
  }, [enabled, cancel]);

  /** A pointer's position in page px from the padding box, where scene (0, 0) is. */
  const pagePoint = (event: PointerEvent<HTMLElement>): Point | null => {
    const rect = page.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: event.clientX - rect.left - PAGE_BORDER_PX,
      y: event.clientY - rect.top - PAGE_BORDER_PX,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!armed || event.button !== 0 || !event.isPrimary || drag.current) return;
    if (event.pointerType === "touch") return;
    const start = pagePoint(event);
    if (!start) return;
    // No selection starts and the editor keeps its caret, so writing resumes after the line.
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser does not track (synthetic events); the drag still works
      // while the pointer stays over the page.
    }
    drag.current = { pointerId: event.pointerId, start, end: start, stroke: readStroke() };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const at = pagePoint(event);
    if (!at) return;
    current.end = snapTo15(current.start, at);
    setPreview(
      isDrag(current.start, current.end)
        ? { start: current.start, end: current.end, stroke: current.stroke }
        : null,
    );
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const { start, end } = current;
    cancel();
    if (isDrag(start, end)) latest.current.onLine(toScene(start, end, latest.current.zoom));
  };

  const onPointerCancel = (event: PointerEvent<HTMLElement>) => {
    if (drag.current && event.pointerId === drag.current.pointerId) cancel();
  };

  return {
    armed: enabled && armed,
    preview,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
