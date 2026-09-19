import { useEffect, useRef, useState } from "react";
import { isPageBlank, type Page } from "../store/model";
import { renderPageThumbnail, type ExportSource } from "./export";

/**
 * While the overview is open, renders the thumbnails it lacks one page at a time: the
 * first page with something on it and no thumbnail is rendered through the export host
 * and handed to `save`, whose state change brings the next. Nothing new starts while
 * `enabled` is off (the overview closed, or drawing mode, where the drawing is live); a
 * render already under way finishes and is saved, being the page's thumbnail all the
 * same. A page whose render fails is skipped until the overview is next opened.
 */
export function useBackgroundThumbnails(
  enabled: boolean,
  pages: readonly Page[],
  thumbnails: Record<string, string>,
  source: ExportSource | null,
  save: (pageId: string, dataURL: string) => void,
): void {
  /** The page being rendered, so a re-render of the caller does not start it twice. */
  const busy = useRef<string | null>(null);
  const failed = useRef(new Set<string>());
  const [, retry] = useState(0);
  const saver = useRef(save);
  useEffect(() => {
    saver.current = save;
  }, [save]);

  useEffect(() => {
    if (!enabled || !source) {
      failed.current.clear();
      return;
    }
    if (busy.current) return;
    const page = pages.find(
      (candidate) =>
        !thumbnails[candidate.id] && !failed.current.has(candidate.id) && !isPageBlank(candidate),
    );
    if (!page) return;
    busy.current = page.id;
    renderPageThumbnail(page, source)
      .then((dataURL) => {
        busy.current = null;
        saver.current(page.id, dataURL);
      })
      .catch((error: unknown) => {
        console.warn("typestill: thumbnail failed", error);
        busy.current = null;
        failed.current.add(page.id);
        retry((n) => n + 1);
      });
  }, [enabled, pages, thumbnails, source]);
}
