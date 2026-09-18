import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { DrawingLayer } from "../store/model";
import { useDrawingStill } from "./stills";
import type { Orientation, PageSize } from "./paper";

export interface DrawingStillProps {
  elements: readonly ExcalidrawElement[];
  files: BinaryFiles;
  size: PageSize;
  orientation: Orientation;
  /** Over the text (z-index 2) or under it (z-index 0, before the columns in the DOM). */
  layer: DrawingLayer;
  /** Dark paper: the still takes the inversion filter Excalidraw's dark mode uses. */
  inverted: boolean;
  /** The page's outer size in CSS px, so the still is scaled exactly like the page. */
  width: number;
  height: number;
}

/**
 * A page's drawing as a still picture in writing mode: an <img> the size of the page,
 * taking no pointer events, that the page renderer carries into thumbnails and exports.
 * It starts at the page's padding box, where the text is laid out too, at the page's
 * outer size, so a scene px is the same length in the still and in the live editor (the
 * border's width is clipped at the far edges). Nothing is rendered while the still is
 * being built, or for an empty drawing.
 */
export function DrawingStill({
  elements,
  files,
  size,
  orientation,
  layer,
  inverted,
  width,
  height,
}: DrawingStillProps) {
  const url = useDrawingStill(elements, files, size, orientation);
  if (!url) return null;
  return (
    <img
      className={`text-page__drawing text-page__drawing--${layer}${inverted ? " is-inverted" : ""}`}
      src={url}
      alt=""
      draggable={false}
      style={{ width, height }}
    />
  );
}
