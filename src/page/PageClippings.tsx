// The clippings of a lined page and their handling: TextPage renders the "under" ones
// before its columns and the "over" ones after, and hands this hook its pointer and key
// events. Dragging and resizing are local state; the new geometry is reported on release.

import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import {
  useEffect,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  CORNERS,
  clippingAt,
  resizeClipping,
  type Clipping,
  type ClippingLayer,
  type Corner,
} from "./clippings";
import { SCENE_PX_PER_MM, mmToCssPx } from "./paper";

export interface PageClippingsOptions {
  clippings: readonly Clipping[];
  files: Record<string, BinaryFileData>;
  /** CSS px per scene px. */
  zoom: number;
  /** The page element, for pointer positions and keyboard focus. */
  page: RefObject<HTMLDivElement | null>;
  /** No selection, dragging or keys: the preview, or a page that is not the open one. */
  locked: boolean;
  onChange?: (clippings: Clipping[]) => void;
}

interface Drag {
  id: string;
  /** The corner being dragged, or null when the whole clipping moves. */
  corner: Corner | null;
  /** Where the pointer went down, in mm. */
  origin: { x: number; y: number };
  start: Clipping;
  live: Clipping;
}

const CHROME = "text-page__clip-chrome";

/** Whether an event's target is inside an editor rather than on the page itself. */
const inEditor = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[contenteditable="true"]') !== null;

/**
 * Selection, dragging, corner resizing, relayering and deletion of a page's clippings.
 * Returns what TextPage renders for each layer, the chrome of the selected clipping,
 * and the handlers the page element needs: a capture-phase pointer down (Alt reaches a
 * clipping under the text before the editor sees the click; a click elsewhere
 * deselects) and the keys (Backspace and Delete remove, Escape deselects).
 */
export function usePageClippings({
  clippings,
  files,
  zoom,
  page,
  locked,
  onChange,
}: PageClippingsOptions) {
  const [selectedId, setSelected] = useState<string | null>(null);
  const [dragState, setDrag] = useState<Drag | null>(null);
  /** Height over width of each clipping's image, known once it has loaded. */
  const [aspects, setAspects] = useState<Record<string, number>>({});
  // A selection that no longer exists (deleted, page changed) or a locked page has none.
  const selected =
    !locked && selectedId && clippings.some((c) => c.id === selectedId) ? selectedId : null;
  const drag = locked ? null : dragState;

  const px = (mm: number) => mmToCssPx(mm, zoom);
  const toMm = (event: { clientX: number; clientY: number }) => {
    const box = page.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: (event.clientX - box.left) / zoom / SCENE_PX_PER_MM,
      y: (event.clientY - box.top) / zoom / SCENE_PX_PER_MM,
    };
  };

  const shown = drag ? clippings.map((c) => (c.id === drag.id ? drag.live : c)) : clippings;
  const current = selected ? (shown.find((c) => c.id === selected) ?? null) : null;
  const aspectOf = (clipping: Clipping) => aspects[clipping.id];

  const startDrag = (clipping: Clipping, corner: Corner | null, event: PointerEvent) => {
    if (locked || event.button !== 0) return;
    const origin = toMm(event);
    if (!origin) return;
    event.preventDefault();
    event.stopPropagation();
    page.current?.focus({ preventScroll: true });
    setSelected(clipping.id);
    setDrag({ id: clipping.id, corner, origin, start: clipping, live: clipping });
  };

  // The drag follows the pointer anywhere in the window and ends on release. The
  // listeners are renewed on every move, so the release sees the drag as it is.
  useEffect(() => {
    if (!drag) return;
    const aspect = aspects[drag.id] ?? 1;
    const move = (event: globalThis.PointerEvent) => {
      const at = toMm(event);
      if (!at) return;
      const live = drag.corner
        ? resizeClipping(drag.start, aspect, drag.corner, at)
        : {
            ...drag.start,
            x: drag.start.x + at.x - drag.origin.x,
            y: drag.start.y + at.y - drag.origin.y,
          };
      setDrag({ ...drag, live });
    };
    const up = () => {
      setDrag(null);
      const { start, live } = drag;
      if (live.x !== start.x || live.y !== start.y || live.width !== start.width) {
        onChange?.(clippings.map((c) => (c.id === drag.id ? live : c)));
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  });

  // A pointer down outside the page deselects, as one elsewhere on the page does.
  useEffect(() => {
    if (!selected) return;
    const onDown = (event: globalThis.PointerEvent) => {
      if (!page.current?.contains(event.target as Node)) setSelected(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [selected, page]);

  const remove = (id: string) => {
    setSelected(null);
    onChange?.(clippings.filter((c) => c.id !== id));
  };
  const relayer = (id: string, layer: ClippingLayer) =>
    onChange?.(clippings.map((c) => (c.id === id ? { ...c, layer } : c)));

  /** The page's capture-phase pointer down. */
  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    const target = event.target as Element;
    if (event.altKey && event.button === 0) {
      const at = toMm(event);
      const hit = at && clippingAt(clippings, new Map(Object.entries(aspects)), at);
      if (hit) {
        startDrag(hit, null, event);
        return;
      }
    }
    if (!target.closest(`.text-page__clipping, .${CHROME}`)) setSelected(null);
  };

  /** The page's key down: only for keys on the page itself, never the editor's. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (locked || !selected || inEditor(event.target)) return;
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      remove(selected);
    } else if (event.key === "Escape") {
      setSelected(null);
    }
  };

  /** The clippings of one layer, as images positioned in mm. */
  const render = (layer: ClippingLayer): ReactNode =>
    shown
      .filter((clipping) => clipping.layer === layer)
      .map((clipping) => {
        const file = files[clipping.fileId];
        if (!file) return null;
        return (
          <img
            key={clipping.id}
            className={`text-page__clipping text-page__clipping--${layer}${
              clipping.id === selected ? " is-selected" : ""
            }`}
            src={file.dataURL}
            alt=""
            draggable={false}
            style={{ left: px(clipping.x), top: px(clipping.y), width: px(clipping.width) }}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0) {
                setAspects((all) =>
                  all[clipping.id] === naturalHeight / naturalWidth
                    ? all
                    : { ...all, [clipping.id]: naturalHeight / naturalWidth },
                );
              }
            }}
            onPointerDown={locked ? undefined : (event) => startDrag(clipping, null, event)}
          />
        );
      });

  /**
   * The frame, corner handles and tools of the selected clipping; editing chrome. The
   * frame of a clipping over the text is its drag surface; under the text it lets the
   * pointer through to the editor (Alt-drag moves it), only its handles and tools react.
   */
  const chrome: ReactNode =
    !locked && current && aspectOf(current) !== undefined ? (
      <div
        className={`${CHROME} is-${current.layer}`}
        style={{
          left: px(current.x),
          top: px(current.y),
          width: px(current.width),
          height: px(current.width * aspectOf(current)),
        }}
        onPointerDown={(event) => startDrag(current, null, event)}
      >
        {CORNERS.map((corner) => (
          <div
            key={corner}
            className={`text-page__clip-handle text-page__clip-handle--${corner}`}
            onPointerDown={(event) => startDrag(current, corner, event)}
          />
        ))}
        {!drag && (
          <div className="text-page__clip-tools" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => relayer(current.id, current.layer === "over" ? "under" : "over")}
            >
              {current.layer === "over" ? "Send behind" : "Bring in front"}
            </button>
            <button type="button" onClick={() => remove(current.id)}>
              Delete
            </button>
          </div>
        )}
      </div>
    ) : null;

  return { render, chrome, onPointerDownCapture, onKeyDown, dragging: drag !== null };
}
