import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { DrawingStroke } from "./drawingMode";
import type { QuickLine } from "./quickLine";

/**
 * A quick line as an ordinary Excalidraw line element in scene px, through the public
 * converter, so it is selectable and editable in drawing mode like anything drawn there.
 * The converter takes the line's start as its origin and its run as the second point.
 */
export function quickLineElement(line: QuickLine, stroke: DrawingStroke): ExcalidrawElement {
  const [element] = convertToExcalidrawElements([
    {
      type: "line",
      x: line.x,
      y: line.y,
      points: [
        [0, 0],
        [line.dx, line.dy],
      ],
      strokeColor: stroke.strokeColor,
      strokeWidth: stroke.strokeWidth,
      roughness: stroke.roughness,
    },
  ]);
  return element;
}
