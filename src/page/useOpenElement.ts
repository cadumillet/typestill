import { useEffect, useRef, type RefObject } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { hitElement } from "./hitTest";
import { PAGE_BORDER_PX } from "./pageLook";

export interface UseOpenElementOptions {
  /** The page is the open one in writing mode with nothing over it; off, nothing listens. */
  enabled: boolean;
  /** CSS px per scene px. */
  zoom: number;
  /** The page's drawing, as shown by the still. */
  elements: readonly ExcalidrawElement[];
  /** A drawn element was double-clicked: the caller opens it in drawing mode. */
  onOpen: (id: string) => void;
}

/**
 * Double-click into drawing mode: while the page is the open one in writing mode, a
 * double-click on a drawn element's outline (anywhere on a drawn text or image) opens
 * it. The listener is on the page element in the capture phase, so on a hit the
 * editor's own double-click (a word selection) never happens; on no hit nothing
 * changes. The point is read from the page's padding box, where scene (0, 0) is, over
 * the zoom, and tested against the outlines (hitTest.ts), so writing inside a drawn box
 * still selects words. Page-level, outside Column.
 */
export function useOpenElement(
  page: RefObject<HTMLElement | null>,
  { enabled, zoom, elements, onOpen }: UseOpenElementOptions,
): void {
  const latest = useRef({ zoom, elements, onOpen });
  useEffect(() => {
    latest.current = { zoom, elements, onOpen };
  }, [zoom, elements, onOpen]);

  useEffect(() => {
    const element = page.current;
    if (!enabled || !element) return;
    const onDoubleClick = (event: MouseEvent) => {
      const { zoom: z, elements: drawing, onOpen: open } = latest.current;
      if (drawing.length === 0) return;
      const rect = element.getBoundingClientRect();
      const point = {
        x: (event.clientX - rect.left - PAGE_BORDER_PX) / z,
        y: (event.clientY - rect.top - PAGE_BORDER_PX) / z,
      };
      const hit = hitElement(drawing, point);
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      open(hit.id);
    };
    element.addEventListener("dblclick", onDoubleClick, true);
    return () => element.removeEventListener("dblclick", onDoubleClick, true);
  }, [page, enabled]);
}
