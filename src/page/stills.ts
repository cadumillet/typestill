// The still picture of a page's drawing, shown in writing mode: Excalidraw's SVG export
// of the elements with no background, over a transparent page-sized frame so the SVG's
// viewport is the page whatever the elements' bounds. It is drawn as an <img> in the page
// element (see DrawingStill.tsx), so the page renderer carries it into thumbnails and
// exports with nothing extra. Stills are cached in memory by the elements' versions.

import { convertToExcalidrawElements, exportToSvg } from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
} from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { useEffect, useReducer } from "react";
import { elementsKey } from "../store/autosave";
import { pageGeometry, type Orientation, type PageSize } from "./paper";

/** Stills kept in memory. Old ones go first once the cache is full. */
const CACHE_LIMIT = 64;
const stills = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

/** Identity of a still: which elements at what version, on which page size. */
function stillKey(
  elements: readonly ExcalidrawElement[],
  size: PageSize,
  orientation: Orientation,
) {
  return `${size}|${orientation}|${elementsKey(elements)}`;
}

/**
 * A transparent frame the size of the page, at the page's origin. The converter pads a
 * frame by 10px around its (here absent) children and so puts it at (-10, -10); the
 * origin is set back, or the whole still would sit 10 scene px down and to the right.
 */
function pageFrame(size: PageSize, orientation: Orientation): ExcalidrawFrameLikeElement {
  const { width, height } = pageGeometry(size, orientation);
  const [frame] = convertToExcalidrawElements([
    { type: "frame", children: [], x: 0, y: 0, width, height, name: "page" },
  ]);
  return { ...frame, x: 0, y: 0, width, height } as ExcalidrawFrameLikeElement;
}

/** The SVG of the drawing framed by the page, as a data URL. */
async function buildStill(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
  size: PageSize,
  orientation: Orientation,
): Promise<string> {
  const frame = pageFrame(size, orientation);
  const live = elements.filter((element) => !element.isDeleted);
  const svg = await exportToSvg({
    elements: [...live, frame],
    files,
    exportingFrame: frame,
    appState: { exportBackground: false, exportWithDarkMode: false },
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
}

function remember(key: string, url: string): void {
  if (stills.size >= CACHE_LIMIT) {
    const oldest = stills.keys().next().value;
    if (oldest !== undefined) stills.delete(oldest);
  }
  stills.set(key, url);
}

/**
 * Builds the still of a drawing, or returns it from the cache. Exports call this before
 * mounting a page off screen, so the page finds its still ready on its first render.
 */
export function primeDrawingStill(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
  size: PageSize,
  orientation: Orientation,
): Promise<string> {
  const key = stillKey(elements, size, orientation);
  const cached = stills.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  let job = pending.get(key);
  if (!job) {
    job = buildStill(elements, files, size, orientation)
      .then((url) => {
        remember(key, url);
        return url;
      })
      .finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}

/**
 * The still of a drawing, or null while it is being built (the component renders again
 * when it is ready). An empty drawing has no still.
 */
export function useDrawingStill(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
  size: PageSize,
  orientation: Orientation,
): string | null {
  const empty = !elements.some((element) => !element.isDeleted);
  const key = stillKey(elements, size, orientation);
  const cached = empty ? null : (stills.get(key) ?? null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (empty || cached !== null) return;
    let cancelled = false;
    primeDrawingStill(elements, files, size, orientation)
      .then(() => {
        if (!cancelled) rerender();
      })
      .catch((error: unknown) => console.warn("typestill: drawing still failed", error));
    return () => {
      cancelled = true;
    };
    // The elements are identified by their key; a new array with the same key is the same drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, empty, cached]);
  return cached;
}
