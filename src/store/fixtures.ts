// Test helpers. Minimal Excalidraw-shaped elements: the store only reads id, type,
// version, isDeleted and fileId, and search reads text and originalText. And a section,
// named after its id.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { COVER_COLORS } from "../notebook/cover";
import type { Section } from "./model";

/** A section named after its id, in the first palette colour, not yet visited. */
export function section(id: string, extra: Partial<Omit<Section, "id">> = {}): Section {
  return { id, name: id, color: COVER_COLORS[0].value, lastPageId: null, ...extra };
}

export function element(
  id: string,
  extra: Partial<{ type: string; version: number; isDeleted: boolean; fileId: string }> = {},
): ExcalidrawElement {
  return {
    id,
    type: "rectangle",
    version: 1,
    isDeleted: false,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...extra,
  } as unknown as ExcalidrawElement;
}

export function imageElement(id: string, fileId: string): ExcalidrawElement {
  return element(id, { type: "image", fileId });
}

/**
 * A text element as typed. Excalidraw keeps the wrapped text in `text` and the source in
 * `originalText`; both are the given text unless `originalText` is passed.
 */
export function textElement(
  id: string,
  text: string,
  extra: { originalText?: string; isDeleted?: boolean } = {},
): ExcalidrawElement {
  return {
    ...element(id, { type: "text", isDeleted: extra.isDeleted ?? false }),
    text,
    originalText: extra.originalText ?? text,
  } as unknown as ExcalidrawElement;
}

export function fileData(id: string): BinaryFileData {
  return {
    id,
    mimeType: "image/png",
    dataURL: "data:image/png;base64,AAAA",
    created: 1,
  } as unknown as BinaryFileData;
}
