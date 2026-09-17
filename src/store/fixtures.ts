// Test helpers. Minimal Excalidraw-shaped elements: the store only reads id, type,
// version, isDeleted and fileId.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

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

export function fileData(id: string): BinaryFileData {
  return {
    id,
    mimeType: "image/png",
    dataURL: "data:image/png;base64,AAAA",
    created: 1,
  } as unknown as BinaryFileData;
}
