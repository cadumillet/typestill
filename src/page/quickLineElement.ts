import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { DrawingStroke } from "./drawingMode";
import type { Box, QuickLine } from "./quickLine";

/** What a quick drag reports on release: the element and its geometry in scene px. */
export type QuickShape =
  | ({ kind: "line" } & QuickLine)
  | ({ kind: "arrow" } & QuickLine)
  | ({ kind: "rectangle" } & Box)
  | ({ kind: "ellipse" } & Box);

/**
 * A quick shape as an ordinary Excalidraw element in scene px, through the public
 * converter, so it is selectable and editable in drawing mode like anything drawn there.
 * A line or arrow takes the drag's start as its origin and its run as the second point,
 * the arrow with a head at the end; a rectangle or ellipse takes the drag's box. All in
 * the remembered stroke, with no fill, so they read as the same pen.
 */
export function quickShapeElement(shape: QuickShape, stroke: DrawingStroke): ExcalidrawElement {
  const common = {
    strokeColor: stroke.strokeColor,
    strokeWidth: stroke.strokeWidth,
    roughness: stroke.roughness,
  };
  const skeleton: ExcalidrawElementSkeleton =
    shape.kind === "rectangle" || shape.kind === "ellipse"
      ? {
          type: shape.kind,
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
          backgroundColor: "transparent",
          ...common,
        }
      : shape.kind === "arrow"
        ? {
            type: "arrow",
            x: shape.x,
            y: shape.y,
            points: [
              [0, 0],
              [shape.dx, shape.dy],
            ],
            endArrowhead: "arrow",
            ...common,
          }
        : {
            type: "line",
            x: shape.x,
            y: shape.y,
            points: [
              [0, 0],
              [shape.dx, shape.dy],
            ],
            ...common,
          };
  const [element] = convertToExcalidrawElements([skeleton]);
  return element;
}
