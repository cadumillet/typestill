import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";

export interface PageCanvasProps {
  /** Zoom at which the page's scene fills the page box exactly. */
  zoom: number;
  /** The page box, in CSS px relative to this component. */
  box: { x: number; y: number; width: number; height: number };
}

interface Viewport {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

const EPSILON = 1e-6;

/** Excalidraw zoom shortcuts (with ctrl/cmd): zoom in, zoom out, reset. */
const ZOOM_KEYS = new Set(["=", "+", "-", "_", "0"]);

// Everything that lives in Excalidraw's main menu is either unwanted (scene files, theme,
// background colour) or handled by the shell later (export).
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

/**
 * An Excalidraw editor whose viewport is pinned: scene origin sits at `offset`, zoom is
 * fixed, and every way of panning or zooming is either intercepted before Excalidraw
 * sees it or undone immediately after.
 */
export function PageCanvas({ zoom, box }: PageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // Excalidraw maps scene to screen as (scene + scroll) * zoom, so the scroll that puts
  // the scene origin at the page box corner is corner / zoom.
  const target = useMemo<Viewport>(
    () => ({ zoom, scrollX: box.x / zoom, scrollY: box.y / zoom }),
    [zoom, box.x, box.y],
  );
  // Same values, readable from callbacks whose identity must stay stable.
  const targetRef = useRef(target);
  const boxRef = useRef(box);
  useEffect(() => {
    boxRef.current = box;
  }, [box.x, box.y, box.width, box.height]); // eslint-disable-line react-hooks/exhaustive-deps -- box is an inline object

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

  // Re-pin when the page box moves or resizes. The initial viewport comes from initialData.
  useEffect(() => {
    if (targetRef.current === target) return;
    targetRef.current = target;
    clamp();
  }, [target, clamp]);

  // Intercept pan/zoom input in the capture phase, before Excalidraw's own listeners.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (event: WheelEvent) => {
      // Let Excalidraw's panels (colour pickers, menus) scroll normally.
      if (!isOverCanvas(event.target)) return;
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
      const overCanvas = isOverCanvas(event.target);
      // Outside the clip-path the canvas is not hit-testable, so a desk click lands on
      // Excalidraw's container instead.
      const overContainer =
        event.target instanceof Element && event.target.classList.contains("excalidraw-container");
      if (!overCanvas && !overContainer) return;
      // Middle button drag pans.
      if (event.button === 1) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // The editor is larger than the page. Input on the desk never starts a stroke, and a
      // plain click there deselects, like clicking empty paper would. Focus still moves
      // (no preventDefault) so an open text editor commits.
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

  // Excalidraw calls this from its constructor, before it has mounted, so no scene
  // updates here. In dev StrictMode it runs twice; the last (kept) instance wins.
  const handleApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  const handleChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (_elements, appState) => {
      // The hand tool is hidden from the toolbar but still reachable via its shortcut.
      if (appState.activeTool.type === "hand") {
        apiRef.current?.setActiveTool({ type: "selection" });
      }
    },
    [],
  );

  // Excalidraw reads this once, when it mounts, so it tracks the latest target until then.
  const initialData = useMemo<ExcalidrawProps["initialData"]>(
    () => ({
      appState: {
        viewBackgroundColor: "transparent",
        scrollX: target.scrollX,
        scrollY: target.scrollY,
        zoom: { value: target.zoom as NormalizedZoomValue },
      },
    }),
    [target],
  );

  // Consumed by the clip-path in excalidraw.css: only the page box of each canvas is
  // visible or hit-testable, so strokes outside the page are clipped and cannot start there.
  const clipStyle = {
    "--page-left": `${box.x}px`,
    "--page-top": `${box.y}px`,
    "--page-width": `${box.width}px`,
    "--page-height": `${box.height}px`,
  } as CSSProperties;

  return (
    <div ref={hostRef} className="page-canvas" style={clipStyle}>
      <Excalidraw
        excalidrawAPI={handleApi}
        initialData={initialData}
        theme="light"
        name="typestill"
        autoFocus
        UIOptions={UI_OPTIONS}
        onScrollChange={clamp}
        onChange={handleChange}
      />
    </div>
  );
}
