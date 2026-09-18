import { useEffect, useRef, type RefObject } from "react";
import { renderPageToPng } from "../page/render";

/** Quiet time after a change before the page is rendered. */
const DELAY_MS = 1200;
/** Rendered width in px: shown at half that, so it stays crisp on dense screens. */
export const THUMBNAIL_WIDTH = 240;

/**
 * Keeps the open page's thumbnail fresh: whenever `key` changes (the page, its content
 * or its look), the page element inside `desk` is rendered after a quiet moment and
 * handed to `save`. Rendering reads the live DOM, so it waits for edits to settle.
 */
export function usePageThumbnail(
  desk: RefObject<HTMLElement | null>,
  key: string,
  enabled: boolean,
  save: (dataURL: string) => void,
): void {
  // The render fires later; it must reach the latest saver, not the one of its render.
  const saver = useRef(save);
  useEffect(() => {
    saver.current = save;
  }, [save]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const page = desk.current?.querySelector<HTMLElement>(".text-page");
      if (!page) return;
      renderPageToPng(page, { width: THUMBNAIL_WIDTH })
        .then((dataURL) => {
          if (!cancelled) saver.current(dataURL);
        })
        .catch((error: unknown) => console.warn("typestill: thumbnail failed", error));
    }, DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [desk, key, enabled]);
}
