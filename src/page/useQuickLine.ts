import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { focusContextOf } from "../shell/useShortcuts";
import { readStroke, type DrawingStroke } from "./drawingMode";
import { PAGE_BORDER_PX } from "./pageLook";
import {
  isBoxDrag,
  isDrag,
  nextElement,
  toScene,
  toSceneBox,
  type Point,
  type QuickElement,
} from "./quickLine";
import type { QuickShape } from "./quickLineElement";
import { popForUndo, popLine, push, type LogEntry } from "./quickLineLog";

export interface QuickLinePreview {
  /** The drag so far, in page px from the padding box's origin. */
  start: Point;
  end: Point;
  /** The stroke the shape will have, for the preview to match. */
  stroke: DrawingStroke;
  /** What the drag draws: the hold's element, which Option may change mid-drag. */
  element: QuickElement;
}

export interface QuickLineHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
}

export interface QuickLineState {
  /** Shift is held: the page takes the pointer for a line and shows a crosshair. */
  armed: boolean;
  /** What the next drag draws: the line on arming, cycled by Option while armed. */
  element: QuickElement;
  /** A line being dragged past the dead zone, or null. */
  preview: QuickLinePreview | null;
  /** For the page element. */
  handlers: QuickLineHandlers;
  /** For each column: a text edit to log against the lines, so Cmd+Z walks both. */
  onEdit: () => void;
}

export interface UseQuickLineOptions {
  /** The page is the open one in writing mode with nothing over it; off, nothing arms. */
  enabled: boolean;
  /** CSS px per scene px, for the line's scene coordinates. */
  zoom: number;
  /** A shape drawn, in scene px; returns the element's id, for its undo. */
  onLine: (shape: QuickShape) => string | void;
  /** Removes a quick line by its element id: Cmd+Z or a right click while armed. */
  onUndoLine: (id: string) => void;
  /** The undo depth of the column that has the keyboard, 0 when none has it. */
  undoDepth: () => number;
}

interface Drag {
  pointerId: number;
  start: Point;
  end: Point;
  stroke: DrawingStroke;
  element: QuickElement;
}

/** Whether a drag from `start` to `end` draws `element`: a box needs one direction clear. */
function draws(element: QuickElement, start: Point, end: Point): boolean {
  return element === "rectangle" || element === "ellipse"
    ? isBoxDrag(start, end)
    : isDrag(start, end);
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
 * pointer and drags the hold's element (the line on arming; Option, with Shift still
 * down, cycles it through rectangle, ellipse and arrow and back, the choice lasting the
 * hold and shown by the page's indicator): a line follows the pointer freely, a box takes
 * the drag's corners, an arrow runs start to end; past the dead zone a preview shows, and on release the line is reported in scene px, a shorter drag
 * being nothing. Shift released mid-drag disarms but the drag finishes; Escape cancels it;
 * other pointers are ignored.
 */
export function useQuickLine(
  page: RefObject<HTMLElement | null>,
  { enabled, zoom, onLine, onUndoLine, undoDepth }: UseQuickLineOptions,
): QuickLineState {
  const [armed, setArmed] = useState(false);
  const [preview, setPreview] = useState<QuickLinePreview | null>(null);
  /** The hold's element: the line on arming, stepped by Option, back to the line on Shift up. */
  const [element, setElement] = useState<QuickElement>("line");
  const drag = useRef<Drag | null>(null);
  /** Pointer buttons down anywhere in the document: a selection in progress must not be interrupted. */
  const buttonsDown = useRef(0);
  /** The page's action log: lines by id and text edits, newest last. */
  const log = useRef<readonly LogEntry[]>([]);
  /** The armed state and the element as the document listeners see them. */
  const armedRef = useRef(false);
  const elementRef = useRef<QuickElement>("line");
  useEffect(() => {
    armedRef.current = enabled && armed;
    elementRef.current = element;
  }, [enabled, armed, element]);
  /** The preview for a drag, or none while it is under the dead zone. */
  const showPreview = (current: Drag) =>
    setPreview(
      draws(current.element, current.start, current.end)
        ? {
            start: current.start,
            end: current.end,
            stroke: current.stroke,
            element: current.element,
          }
        : null,
    );
  const latest = useRef({ zoom, onLine, onUndoLine, undoDepth });
  useEffect(() => {
    latest.current = { zoom, onLine, onUndoLine, undoDepth };
  }, [zoom, onLine, onUndoLine, undoDepth]);

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
    const disarm = () => {
      setArmed(false);
      setElement("line");
      elementRef.current = "line";
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        if (!event.repeat && buttonsDown.current === 0 && !focusTaken()) setArmed(true);
      } else if (event.key === "Alt") {
        // Option cycles the element for the rest of the hold; while armed a bare Alt
        // must not reach the browser, where it focuses the menu on Windows and Linux.
        if (!armedRef.current) return;
        event.preventDefault();
        if (!event.repeat && event.shiftKey && !event.metaKey && !event.ctrlKey) {
          const next = nextElement(elementRef.current);
          elementRef.current = next;
          setElement(next);
          // Mid-drag, the preview is redrawn as the new element from the same points.
          if (drag.current) {
            drag.current.element = next;
            showPreview(drag.current);
          }
        }
      } else if (event.key === "Tab") {
        disarm();
      } else if (event.key === "Escape") {
        cancel();
        disarm();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "z"
      ) {
        // Cmd/Ctrl+Z walks the page's actions: a line on top goes here, a text edit on
        // top is the editor's to undo (the event goes on to it).
        if (focusTaken()) return;
        const { log: rest, step } = popForUndo(log.current, latest.current.undoDepth());
        log.current = rest;
        if (step?.kind === "line") {
          event.preventDefault();
          event.stopPropagation();
          latest.current.onUndoLine(step.id);
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") disarm();
      else if (event.key === "Alt" && armedRef.current) event.preventDefault();
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
      log.current = [];
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

  /** A right click while armed: cancels a drag, else takes back the line just placed. */
  const undoByRightClick = () => {
    if (drag.current) {
      cancel();
      return;
    }
    const { log: rest, step } = popLine(log.current);
    log.current = rest;
    if (step?.kind === "line") latest.current.onUndoLine(step.id);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (armed && event.button === 2) {
      event.preventDefault();
      undoByRightClick();
      return;
    }
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
    drag.current = {
      pointerId: event.pointerId,
      start,
      end: start,
      stroke: readStroke(),
      element,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const at = pagePoint(event);
    if (!at) return;
    // The line follows the pointer freely; no angle snapping (the owner's call, 2026-09-19).
    current.end = at;
    showPreview(current);
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const { start, end, element: kind } = current;
    cancel();
    if (draws(kind, start, end)) {
      const { zoom: z } = latest.current;
      const shape: QuickShape =
        kind === "rectangle" || kind === "ellipse"
          ? { kind, ...toSceneBox(start, end, z) }
          : { kind, ...toScene(start, end, z) };
      const id = latest.current.onLine(shape);
      if (typeof id === "string") log.current = push(log.current, { kind: "line", id });
    }
  };

  const onPointerCancel = (event: PointerEvent<HTMLElement>) => {
    if (drag.current && event.pointerId === drag.current.pointerId) cancel();
  };

  // The context menu stays away while the page is armed: the right button is the undo.
  const onContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (armed || drag.current) event.preventDefault();
  };

  const onEdit = useCallback(() => {
    log.current = push(log.current, { kind: "text" });
  }, []);

  return {
    armed: enabled && armed,
    element,
    preview,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu },
    onEdit,
  };
}
