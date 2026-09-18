import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import type { Page } from "../store/model";
import { imageFilesOf } from "./images";
import { POOL_DRAG_TYPE, describeUsage, isUsed, poolEntries } from "./pool";
import "./mediapool.css";

export interface MediaPoolProps {
  files: Record<string, BinaryFileData>;
  pages: readonly Page[];
  canvasFileIds: readonly string[];
  /** Whether the open page is a zine page with a cell chosen, so a click can place. */
  canPlace: boolean;
  onAddImages: (files: File[]) => void;
  /** An image clicked while a cell is chosen on the open zine page. */
  onPlace: (fileId: string) => void;
  onDelete: (fileId: string) => void;
}

/**
 * The notebook's media pool: every image, newest first, with where it is used. Images
 * come in by drop, paste or the file picker; they leave by drag (to a cell or the canvas)
 * or by deletion, which is refused while the image is in use anywhere.
 */
export function MediaPool({
  files,
  pages,
  canvasFileIds,
  canPlace,
  onAddImages,
  onPlace,
  onDelete,
}: MediaPoolProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const entries = poolEntries(files, pages, canvasFileIds);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    setOver(false);
    const dropped = imageFilesOf(event.dataTransfer);
    if (dropped.length === 0) return;
    event.preventDefault();
    onAddImages(dropped);
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pasted = imageFilesOf(event.clipboardData);
    if (pasted.length === 0) return;
    event.preventDefault();
    onAddImages(pasted);
  };

  return (
    <div
      className={`media-pool${over ? " is-over" : ""}`}
      tabIndex={0}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <div className="media-pool__bar">
        <span className="media-pool__title">
          Media pool · {entries.length} {entries.length === 1 ? "image" : "images"}
        </span>
        <button type="button" onClick={() => input.current?.click()}>
          Add images…
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const picked = [...(event.target.files ?? [])];
            event.target.value = "";
            if (picked.length > 0) onAddImages(picked);
          }}
        />
      </div>
      {entries.length === 0 ? (
        <p className="media-pool__empty">
          No images yet. Drop, paste or pick some; they can then be placed on zine pages or dragged
          onto the canvas.
        </p>
      ) : (
        <ul className="media-pool__grid">
          {entries.map((entry) => {
            const used = isUsed(entry.usage);
            return (
              <li
                key={entry.id}
                className={`media-pool__item${canPlace ? " can-place" : ""}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(POOL_DRAG_TYPE, entry.id);
                  event.dataTransfer.effectAllowed = "copy";
                }}
              >
                <button
                  type="button"
                  className="media-pool__image"
                  title={canPlace ? "Place in the chosen cell" : "Drag onto a cell or the canvas"}
                  onClick={() => canPlace && onPlace(entry.id)}
                >
                  <img src={entry.data.dataURL} alt="" draggable={false} />
                </button>
                <div className="media-pool__meta">
                  <span className={`media-pool__usage${used ? "" : " is-unused"}`}>
                    {describeUsage(entry.usage)}
                  </span>
                  <button
                    type="button"
                    className="media-pool__delete"
                    disabled={used}
                    title={used ? "In use; replace it on the page or canvas first" : "Delete"}
                    onClick={() => onDelete(entry.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
