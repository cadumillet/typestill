import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { storeStroke, type DrawingStroke } from "./drawingMode";
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
  /** An element to select once the editor is ready: the one double-clicked into drawing mode. Read once, at mount. */
  initialSelection?: string | null;
  /** Escape with the selection tool active and nothing selected: the shell leaves drawing mode. */
  onEscapeOut?: () => void;
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
  initialSelection = null,
  onEscapeOut,
}: PageDrawingProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const latest = useRef<DrawingContent>(initial);
  /** The element still to select once the scene has it; applied once. */
  const pendingSelection = useRef<string | null>(initialSelection);
  /**
   * Where Escape stands, from the latest appState: "out" when the editor is at rest (the
   * selection tool active, nothing selected, nothing being edited), "deselect" when the
   * selection tool holds a selection and no linear element is being edited, else the
   * editor's own (a tool to cancel, a text or line being edited).
   */
  const escape = useRef<"out" | "deselect" | "own">("out");
  const reportTimer = useRef<number | null>(null);
  /** The stroke last remembered for the quick line, so storage is written only on a change. */
  const stroke = useRef<DrawingStroke | null>(null);
  // Callbacks read the latest props from here, so the editor's handlers stay stable.
  const callbacks = useRef({ onChange, onUnmount, onOutsidePointerDown, onEscapeOut });
  useEffect(() => {
    callbacks.current = { onChange, onUnmount, onOutsidePointerDown, onEscapeOut };
  }, [onChange, onUnmount, onOutsidePointerDown, onEscapeOut]);

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
      // Escape walks back: a tool or an edit is Excalidraw's to cancel; a selection is
      // cleared here, since this Excalidraw's Escape (actionFinalize) keeps it; at rest
      // it is the way out of drawing mode. Each runs after Excalidraw has had the key.
      if (event.key === "Escape") {
        const step = escape.current;
        window.setTimeout(() => {
          if (step === "out") callbacks.current.onEscapeOut?.();
          else if (step === "deselect") {
            apiRef.current?.updateScene({ appState: { selectedElementIds: {} } });
          }
        }, 0);
        return;
      }
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

  // The latest drawing goes back to the shell when the editor goes away, and the stroke
  // it was left with is remembered for the quick line.
  useEffect(
    () => () => {
      if (reportTimer.current !== null) window.clearTimeout(reportTimer.current);
      callbacks.current.onUnmount?.(latest.current);
      if (stroke.current) storeStroke(stroke.current);
    },
    [],
  );

  // Excalidraw calls this from its constructor, before it has mounted, so no scene
  // updates here. In dev StrictMode it runs twice; the last (kept) instance wins.
  const handleApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  /** Selects the element double-clicked into drawing mode once the scene has it. */
  const selectPending = useCallback((api: ExcalidrawImperativeAPI) => {
    const id = pendingSelection.current;
    if (!id) return;
    if (!api.getSceneElements().some((element) => element.id === id)) {
      // Not in the scene at all (removed since): nothing to select, ever.
      if (latest.current.elements.length > 0) pendingSelection.current = null;
      return;
    }
    pendingSelection.current = null;
    api.updateScene({ appState: { selectedElementIds: { [id]: true } } });
  }, []);

  const handleChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState, files) => {
      latest.current = { elements, files };
      const selecting =
        appState.activeTool.type === "selection" &&
        !appState.editingTextElement &&
        !appState.editingLinearElement;
      const selected = Object.values(appState.selectedElementIds).some(Boolean);
      escape.current = !selecting ? "own" : selected ? "deselect" : "out";
      if (pendingSelection.current && apiRef.current) selectPending(apiRef.current);
      // The hand tool is hidden from the toolbar but still reachable via its shortcut,
      // and the grid via Cmd+': neither belongs on a page.
      if (appState.activeTool.type === "hand") {
        apiRef.current?.setActiveTool({ type: "selection" });
      }
      if (appState.gridModeEnabled) {
        apiRef.current?.updateScene({ appState: { gridModeEnabled: false } });
      }
      // The current-item stroke is what the quick line draws with, remembered per browser.
      const current = stroke.current;
      if (
        !current ||
        current.strokeColor !== appState.currentItemStrokeColor ||
        current.strokeWidth !== appState.currentItemStrokeWidth ||
        current.roughness !== appState.currentItemRoughness
      ) {
        stroke.current = {
          strokeColor: appState.currentItemStrokeColor,
          strokeWidth: appState.currentItemStrokeWidth,
          roughness: appState.currentItemRoughness,
        };
        storeStroke(stroke.current);
      }
      // Excalidraw reports every pointer move of a stroke; the shell hears a few per second.
      if (reportTimer.current === null) {
        reportTimer.current = window.setTimeout(() => {
          reportTimer.current = null;
          callbacks.current.onChange?.(latest.current);
        }, REPORT_DELAY_MS);
      }
    },
    [selectPending],
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
