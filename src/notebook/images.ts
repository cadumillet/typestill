// Image import. Photos would swamp browser storage and backups, so every image is
// downscaled on import with a canvas (long edge 2048px), re-encoded as JPEG unless it
// has transparency (then PNG), and stored as a data URL keyed by the hash of its bytes,
// so the same picture imported twice is one file. The result is the shape Excalidraw
// uses for its files, so zine pages and the canvas share the notebook's files table.

import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/element/types";

export const MAX_IMAGE_EDGE = 2048;
export const JPEG_QUALITY = 0.85;

/** Types the browser can decode into a bitmap. SVG is left out: it has no pixels to scale. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"]);
/** Types that can carry an alpha channel. */
const ALPHA_TYPES = new Set(["image/png", "image/webp", "image/gif"]);

export function isImageFile(file: { type: string }): boolean {
  return IMAGE_TYPES.has(file.type);
}

/** The image files in a drop or a paste, in order. */
export function imageFilesOf(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  return [...transfer.files].filter(isImageFile);
}

/** Scale that brings the long edge down to `max`, never above 1. */
export function downscaleFactor(width: number, height: number, max = MAX_IMAGE_EDGE): number {
  const edge = Math.max(width, height);
  return edge > max ? max / edge : 1;
}

/** SHA-1 of the bytes as hex: stable per content, and the id format Excalidraw uses. */
export async function hashBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The bytes a data URL encodes. */
export function bytesOfDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Whether any pixel is not fully opaque. */
function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/**
 * Downscales and re-encodes an image, returning it as a notebook file. Throws if the
 * browser cannot decode it.
 */
export async function importImage(file: Blob): Promise<BinaryFileData> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = downscaleFactor(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not draw the image");
    context.drawImage(bitmap, 0, 0, width, height);
    const png = ALPHA_TYPES.has(file.type) && hasTransparency(context, width, height);
    const mimeType = png ? "image/png" : "image/jpeg";
    const dataURL = png ? canvas.toDataURL(mimeType) : canvas.toDataURL(mimeType, JPEG_QUALITY);
    const id = await hashBytes(bytesOfDataUrl(dataURL));
    return {
      id: id as FileId,
      mimeType,
      dataURL: dataURL as DataURL,
      created: Date.now(),
    };
  } finally {
    bitmap.close();
  }
}
