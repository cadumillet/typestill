import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { GRID_PITCH_MM, SCENE_PX_PER_MM } from "../page/paper";
import type { CanvasView } from "../store/model";
import "./canvas.css";

export interface CanvasContent {
  elements: readonly ExcalidrawElement[];
  files: BinaryFiles;
}

export interface CanvasProps {
  /** Drawing to start from. Read once, when the editor mounts. */
  initial?: CanvasContent;
  /**
   * Whether the grid starts on. Excalidraw owns the toggle from then on (Cmd+', the
   * canvas context menu, and its help dialog), because passing the grid as a prop
   * disables its own toggle. Changes are reported through onGridChange.
   */
  initialGridEnabled: boolean;
  /** View to show. Applied on mount and whenever it changes. */
  view?: CanvasView | null;
  onChange?: (content: CanvasContent) => void;
  onGridChange?: (gridEnabled: boolean) => void;
  onViewChange?: (view: CanvasView) => void;
  /** Called with the latest drawing when the editor goes away, e.g. when its pane collapses. */
  onUnmount?: (content: CanvasContent) => void;
}

/** Excalidraw's grid cell in scene px. Grid mode snaps to it. */
const GRID_SIZE = GRID_PITCH_MM * SCENE_PX_PER_MM;
/** Cells between the grid's stronger lines. */
const GRID_STEP = 4;

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

const EMPTY: CanvasContent = { elements: [], files: {} };

/**
 * The notebook's drawing surface: plain infinite Excalidraw. The toolbar is stripped in
 * canvas.css. Its container must stay wider than about 730px or Excalidraw switches to
 * its mobile layout, so the shell collapses the text side rather than squeezing this.
 */
export function Canvas({
  initial = EMPTY,
  initialGridEnabled,
  view,
  onChange,
  onGridChange,
  onViewChange,
  onUnmount,
}: CanvasProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const latest = useRef<CanvasContent>(initial);
  const gridRef = useRef(initialGridEnabled);
  const unmountRef = useRef(onUnmount);
  useEffect(() => {
    unmountRef.current = onUnmount;
  }, [onUnmount]);

  // Read once by Excalidraw on mount; later view changes go through the effect below.
  const initialData = useMemo<ExcalidrawProps["initialData"]>(
    () => ({
      elements: initial.elements,
      files: initial.files,
      appState: {
        gridModeEnabled: initialGridEnabled,
        gridSize: GRID_SIZE,
        gridStep: GRID_STEP,
        viewBackgroundColor: "#ffffff",
        ...(view
          ? {
              scrollX: view.scrollX,
              scrollY: view.scrollY,
              zoom: { value: view.zoom as NormalizedZoomValue },
            }
          : {}),
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally frozen at mount
    [],
  );

  useEffect(() => {
    if (!view) return;
    apiRef.current?.updateScene({
      appState: {
        scrollX: view.scrollX,
        scrollY: view.scrollY,
        zoom: { value: view.zoom as NormalizedZoomValue },
      },
    });
  }, [view]);

  useEffect(() => () => unmountRef.current?.(latest.current), []);

  const handleApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  const handleChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState, files) => {
      latest.current = { elements, files };
      onChange?.(latest.current);
      if (appState.gridModeEnabled !== gridRef.current) {
        gridRef.current = appState.gridModeEnabled;
        onGridChange?.(appState.gridModeEnabled);
      }
    },
    [onChange, onGridChange],
  );

  const handleScroll = useCallback<NonNullable<ExcalidrawProps["onScrollChange"]>>(
    (scrollX, scrollY, zoom) => onViewChange?.({ scrollX, scrollY, zoom: zoom.value }),
    [onViewChange],
  );

  return (
    <div className="canvas">
      <Excalidraw
        excalidrawAPI={handleApi}
        initialData={initialData}
        theme="light"
        name="typestill"
        UIOptions={UI_OPTIONS}
        onChange={handleChange}
        onScrollChange={handleScroll}
      />
    </div>
  );
}
