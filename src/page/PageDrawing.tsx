import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import "./pagedrawing.css";

/** The drawing as the editor has it: its elements and the files its images use. */
export interface DrawingContent {
  elements: readonly ExcalidrawElement[];
  files: BinaryFiles;
}

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageDrawingProps {
  /** CSS px per scene px: the page's on-screen zoom, which the editor is locked to. */
  zoom: number;
  /** The open page's box in CSS px, relative to the desk the editor covers. */
  box: PageBox;
  /** The drawing to start from. Read once, when the editor mounts. */
  initial: DrawingContent;
  /** Excalidraw's dark theme, on dark paper, so the ink shows the way the still will. */
  dark: boolean;
  /** The drawing as it changes, at most a few times a second while a stroke is drawn. */
  onChange?: (content: DrawingContent) => void;
  /** The latest drawing when the editor goes away: drawing mode ended or the page changed. */
  onUnmount?: (content: DrawingContent) => void;
  /**
   * A pointer went down on the desk outside the page (in CSS px relative to the desk):
   * the shell may open another page of the spread there.
   */
  onOutsidePointerDown?: (point: { x: number; y: number }) => void;
}

interface Viewport {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

const EPSILON = 1e-6;
/** Quiet time between change reports while the pointer keeps moving. */
const REPORT_DELAY_MS = 200;

/** Excalidraw zoom shortcuts (with ctrl/cmd): zoom in, zoom out, reset. */
const ZOOM_KEYS = new Set(["=", "+", "-", "_", "0"]);

// Everything in Excalidraw's main menu is either unwanted (scene files, theme,
// background colour) or handled by the shell (export).
const UI_OPTIONS: ExcalidrawProps["UIOptions"] = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    toggleTheme: false,
    saveAsImage: false,
  },
};

const isTextInput = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "INPUT");

const isOverCanvas = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(".excalidraw__canvas") !== null;

/** Outside the clip-path the canvas is not hit-testable: a desk click lands on Excalidraw's container. */
const isOverContainer = (target: EventTarget | null): boolean =>
  target instanceof Element && target.classList.contains("excalidraw-container");

/**
 * The drawing editor of drawing mode: Excalidraw over the whole desk (its container must
 * stay wider than about 730px or it switches to its mobile layout), pinned so that scene
 * (0, 0) is the page's top-left corner at the page's zoom. Zoom and pan are locked: wheel,
 * pinch and the keyboard chords are swallowed in the capture phase, the hand tool is reset
 * from onChange, and any scroll or zoom Excalidraw reports is set back. The canvases are
 * clipped to the page (pagedrawing.css), so a stroke cannot start on the desk and what is
 * drawn past the edge is cut. The grid stays off; the toolbar is stripped in CSS.
 */
export function PageDrawing({
  zoom,
  box,
  initial,
  dark,
  onChange,
  onUnmount,
  onOutsidePointerDown,
}: PageDrawingProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const latest = useRef<DrawingContent>(initial);
  const reportTimer = useRef<number | null>(null);
  // Callbacks read the latest props from here, so the editor's handlers stay stable.
  const callbacks = useRef({ onChange, onUnmount, onOutsidePointerDown });
  useEffect(() => {
    callbacks.current = { onChange, onUnmount, onOutsidePointerDown };
  }, [onChange, onUnmount, onOutsidePointerDown]);

  // Excalidraw maps scene to screen as (scene + scroll) * zoom, so the scroll that puts
  // the scene origin at the page box corner is corner / zoom.
  const target = useMemo<Viewport>(
    () => ({ zoom, scrollX: box.x / zoom, scrollY: box.y / zoom }),
    [zoom, box.x, box.y],
  );
  const targetRef = useRef(target);
  const boxRef = useRef(box);
  useEffect(() => {
    boxRef.current = box;
  }, [box]);

  const clamp = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const state = api.getAppState();
    const want = targetRef.current;
    if (
      Math.abs(state.scrollX - want.scrollX) < EPSILON &&
      Math.abs(state.scrollY - want.scrollY) < EPSILON &&
      Math.abs(state.zoom.value - want.zoom) < EPSILON
    ) {
      return;
    }
    api.updateScene({
      appState: {
        scrollX: want.scrollX,
        scrollY: want.scrollY,
        zoom: { value: want.zoom as NormalizedZoomValue },
      },
    });
  }, []);

  // Re-pin when the page box moves or resizes (the window was resized, the spread
  // changed). The initial viewport comes from initialData.
  useEffect(() => {
    if (targetRef.current === target) return;
    targetRef.current = target;
    clamp();
  }, [target, clamp]);

  // Intercept pan and zoom input in the capture phase, before Excalidraw's own listeners.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (event: WheelEvent) => {
      // Excalidraw's panels (colour pickers, menus) scroll normally; the desk and the
      // canvas take no wheel at all, pinch (ctrl+wheel) included.
      if (!isOverCanvas(event.target) && !isOverContainer(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) return;
      const zoomShortcut = (event.ctrlKey || event.metaKey) && ZOOM_KEYS.has(event.key);
      // Shift+1 zooms to fit all, Shift+2 to the selection.
      const fitShortcut = event.shiftKey && (event.code === "Digit1" || event.code === "Digit2");
      const spacePan = event.key === " ";
      if (zoomShortcut || fitShortcut || spacePan) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isOverCanvas(event.target) && !isOverContainer(event.target)) return;
      // Middle button drag pans.
      if (event.button === 1) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // The editor is larger than the page. Input on the desk never starts a stroke, and
      // a plain click there deselects, like clicking empty paper would; the shell hears
      // of it too, to open the other page of the spread. Focus still moves (no
      // preventDefault) so an open text editor commits.
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const b = boxRef.current;
      const onPage = x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
      if (onPage) return;
      event.stopPropagation();
      if (event.button === 0) {
        apiRef.current?.updateScene({
          appState: { selectedElementIds: {}, selectedGroupIds: {}, editingGroupId: null },
        });
        callbacks.current.onOutsidePointerDown?.({ x, y });
      }
    };
    const onGesture = (event: Event) => {
      // Safari trackpad pinch.
      event.preventDefault();
      event.stopPropagation();
    };

    const capture = { capture: true } as const;
    const gestures = ["gesturestart", "gesturechange", "gestureend"];
    host.addEventListener("wheel", onWheel, { capture: true, passive: false });
    host.addEventListener("keydown", onKeyDown, capture);
    host.addEventListener("pointerdown", onPointerDown, capture);
    for (const name of gestures) host.addEventListener(name, onGesture, capture);
    return () => {
      host.removeEventListener("wheel", onWheel, capture);
      host.removeEventListener("keydown", onKeyDown, capture);
      host.removeEventListener("pointerdown", onPointerDown, capture);
      for (const name of gestures) host.removeEventListener(name, onGesture, capture);
    };
  }, []);

  // The latest drawing goes back to the shell when the editor goes away.
  useEffect(
    () => () => {
      if (reportTimer.current !== null) window.clearTimeout(reportTimer.current);
      callbacks.current.onUnmount?.(latest.current);
    },
    [],
  );

  // Excalidraw calls this from its constructor, before it has mounted, so no scene
  // updates here. In dev StrictMode it runs twice; the last (kept) instance wins.
  const handleApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  const handleChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState, files) => {
      latest.current = { elements, files };
      // The hand tool is hidden from the toolbar but still reachable via its shortcut,
      // and the grid via Cmd+': neither belongs on a page.
      if (appState.activeTool.type === "hand") {
        apiRef.current?.setActiveTool({ type: "selection" });
      }
      if (appState.gridModeEnabled) {
        apiRef.current?.updateScene({ appState: { gridModeEnabled: false } });
      }
      // Excalidraw reports every pointer move of a stroke; the shell hears a few per second.
      if (reportTimer.current === null) {
        reportTimer.current = window.setTimeout(() => {
          reportTimer.current = null;
          callbacks.current.onChange?.(latest.current);
        }, REPORT_DELAY_MS);
      }
    },
    [],
  );

  // Excalidraw reads this once, when it mounts.
  const initialData = useMemo<ExcalidrawProps["initialData"]>(
    () => ({
      elements: initial.elements,
      files: initial.files,
      appState: {
        viewBackgroundColor: "transparent",
        gridModeEnabled: false,
        scrollX: target.scrollX,
        scrollY: target.scrollY,
        zoom: { value: target.zoom as NormalizedZoomValue },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally frozen at mount
    [],
  );

  // Consumed by the clip-path in pagedrawing.css: only the page box of each canvas is
  // visible or hit-testable, so strokes outside the page are clipped and cannot start there.
  const clipStyle = {
    "--page-left": `${box.x}px`,
    "--page-top": `${box.y}px`,
    "--page-width": `${box.width}px`,
    "--page-height": `${box.height}px`,
  } as CSSProperties;

  return (
    <div ref={hostRef} className="page-drawing" style={clipStyle}>
      <Excalidraw
        excalidrawAPI={handleApi}
        initialData={initialData}
        theme={dark ? "dark" : "light"}
        name="typestill"
        autoFocus
        UIOptions={UI_OPTIONS}
        onScrollChange={clamp}
        onChange={handleChange}
      />
    </div>
  );
}
