import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import {
  useCallback,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
} from "react";
import { imageFilesOf } from "../notebook/images";
import { POOL_DRAG_TYPE } from "../notebook/pool";
import { Column } from "./Column";
import type { Column as ColumnValue } from "./document";
import { FormatBar } from "./FormatBar";
import {
  RULE_PITCH_MM,
  TEXT_LINE_HEIGHT,
  mmToCssPx,
  pageMm,
  type Orientation,
  type PageSize,
} from "./paper";
import { useFormatBar } from "./useFormatBar";
import { defaultCell, zineGeometry, type Box, type Zine, type ZineImage } from "./zine";
import "./textpage.css";
import "./zinepage.css";

export interface ZinePageProps {
  size: PageSize;
  orientation: Orientation;
  /** CSS px per scene px. Sets the rendered size of the page. */
  zoom: number;
  zine: Zine;
  /** The notebook's files, for the images the media block shows. */
  files: Record<string, BinaryFileData>;
  /** Preview: placeholders hidden, no editing. */
  preview?: boolean;
  readOnly?: boolean;
  onChange?: (zine: Zine) => void;
  /** Image files dropped, pasted or picked; null when pasted with every cell full. */
  onAddImages?: (cell: number | null, files: File[]) => void;
  /** An image dragged from the media pool onto a cell. */
  onPlaceFile?: (cell: number, fileId: string) => void;
  /** The cell chosen by clicking it: where a paste, or a click in the pool, lands. */
  selectedCell?: number | null;
  onSelectCell?: (cell: number | null) => void;
}

/** Text blocks are the columns of a zine page: 0 below the media, 1 beside it. */
const BELOW = 0;
const BESIDE = 1;

/**
 * A zine page: the media block (one image or a grid of up to four) with optional text
 * below and beside it, laid out from the page's zine settings. Nothing is dragged:
 * images land in cells by drop, paste or the file picker, and the text blocks are the
 * same editor as lined pages without rules, in the zine typeface.
 */
export function ZinePage({
  size,
  orientation,
  zoom,
  zine,
  files,
  preview = false,
  readOnly = false,
  onChange,
  onAddImages,
  onPlaceFile,
  selectedCell = null,
  onSelectCell,
}: ZinePageProps) {
  const mm = pageMm(size, orientation);
  const px = (value: number) => mmToCssPx(value, zoom);
  const pitch = px(RULE_PITCH_MM);
  const page = useRef<HTMLDivElement>(null);
  const bar = useFormatBar(page);
  const [fullBlocks, setFullBlocks] = useState<boolean[]>([]);
  const locked = preview || readOnly;

  const setBlockFull = useCallback((index: number, full: boolean) => {
    setFullBlocks((current) => {
      if (current[index] === full) return current;
      const next = [...current];
      next[index] = full;
      return next;
    });
  }, []);

  const geometry = zineGeometry(mm, zine);
  const cells = geometry.cells;

  const setImage = (cell: number, image: ZineImage | null) => {
    const images = [...zine.media.images];
    images[cell] = image;
    onChange?.({ ...zine, media: { ...zine.media, images } });
  };

  const setText = (index: number, column: ColumnValue) => {
    onChange?.(index === BELOW ? { ...zine, textBelow: column } : { ...zine, textBeside: column });
  };

  // Images pasted anywhere on the page go to the chosen cell, else the first empty one.
  // Text pastes are left to the editors.
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (locked) return;
    const images = imageFilesOf(event.clipboardData);
    if (images.length === 0) return;
    event.preventDefault();
    onAddImages?.(selectedCell ?? defaultCell(zine), images);
  };

  const style = {
    width: px(mm.width),
    height: px(mm.height),
    "--rule-pitch": `${pitch}px`,
    "--font-size": `${pitch / TEXT_LINE_HEIGHT}px`,
  } as CSSProperties;

  const boxStyle = (box: Box): CSSProperties => ({
    left: px(box.left),
    top: px(box.top),
    width: px(box.width),
    height: px(box.height),
  });

  const textBlocks: { index: number; value: ColumnValue; box: Box }[] = [];
  if (zine.textBelow && geometry.textBelow) {
    textBlocks.push({ index: BELOW, value: zine.textBelow, box: geometry.textBelow });
  }
  if (zine.textBeside && geometry.textBeside) {
    textBlocks.push({ index: BESIDE, value: zine.textBeside, box: geometry.textBeside });
  }

  return (
    <div
      className={`text-page zine-page${preview ? " is-preview" : ""}`}
      style={style}
      ref={page}
      onPaste={onPaste}
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest(".zine-cell")) onSelectCell?.(null);
      }}
    >
      {cells.map((box, index) => (
        <ZineCell
          key={index}
          index={index}
          image={zine.media.images[index] ?? null}
          file={zine.media.images[index] ? files[zine.media.images[index].fileId] : undefined}
          style={boxStyle(box)}
          locked={locked}
          preview={preview}
          selected={selectedCell === index}
          onSelect={() => onSelectCell?.(index)}
          onFiles={(dropped) => onAddImages?.(index, dropped)}
          onPlaceFile={(fileId) => onPlaceFile?.(index, fileId)}
          onFit={(fit) => setImage(index, { ...zine.media.images[index]!, fit })}
          onRemove={() => setImage(index, null)}
        />
      ))}
      {textBlocks.map(({ index, value, box }) => {
        const lines = Math.max(1, Math.floor(box.height / RULE_PITCH_MM + 1e-6));
        return (
          <Column
            key={index}
            ref={bar.bindEditor(index)}
            value={value}
            readOnly={locked}
            lines={lines}
            pitch={pitch}
            style={{
              left: px(box.left),
              width: px(box.width),
              top: px(box.top),
              height: lines * pitch,
            }}
            onChange={(column) => setText(index, column)}
            onFull={(full) => setBlockFull(index, full)}
            onSelection={(at) => bar.setColumnSelection(index, at)}
          />
        );
      })}
      {!locked &&
        textBlocks.map(
          ({ index, box }) =>
            fullBlocks[index] && (
              <div
                key={index}
                className="text-page__full zine-page__full"
                style={{ left: px(box.left), width: px(box.width), top: px(box.top + box.height) }}
              >
                Text full
              </div>
            ),
        )}
      {!locked && bar.selection && (
        <FormatBar
          anchor={bar.selection.anchor}
          bounds={{ width: px(mm.width), height: px(mm.height) }}
          format={bar.selection.format}
          onAction={bar.onAction}
        />
      )}
    </div>
  );
}

interface ZineCellProps {
  index: number;
  image: ZineImage | null;
  file: BinaryFileData | undefined;
  style: CSSProperties;
  locked: boolean;
  preview: boolean;
  selected: boolean;
  onSelect: () => void;
  onFiles: (files: File[]) => void;
  onPlaceFile: (fileId: string) => void;
  onFit: (fit: ZineImage["fit"]) => void;
  onRemove: () => void;
}

/** One cell of the media block: its image with fit and remove controls, or a placeholder. */
function ZineCell({
  index,
  image,
  file,
  style,
  locked,
  preview,
  selected,
  onSelect,
  onFiles,
  onPlaceFile,
  onFit,
  onRemove,
}: ZineCellProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // Two kinds of drop: image files from outside, or an image from the media pool.
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    setOver(false);
    if (locked) return;
    const fileId = event.dataTransfer.getData(POOL_DRAG_TYPE);
    if (fileId) {
      event.preventDefault();
      onPlaceFile(fileId);
      return;
    }
    const files = imageFilesOf(event.dataTransfer);
    if (files.length === 0) return;
    event.preventDefault();
    onFiles(files);
  };

  const className = [
    "zine-cell",
    image ? "has-image" : "is-empty",
    selected && !locked ? "is-selected" : "",
    over ? "is-over" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={style}
      data-cell={index}
      onPointerDown={locked ? undefined : onSelect}
      onDragOver={(event) => {
        if (locked) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {image && file && (
        <img
          className="zine-cell__image"
          src={file.dataURL}
          alt=""
          draggable={false}
          style={{ objectFit: image.fit }}
        />
      )}
      {image && !file && !preview && <div className="zine-cell__missing">Missing image</div>}
      {!image && !preview && (
        <button
          type="button"
          className="zine-cell__add"
          disabled={locked}
          onClick={() => input.current?.click()}
        >
          Add image
        </button>
      )}
      {image && !locked && (
        <div className="zine-cell__tools">
          <button
            type="button"
            onClick={() => onFit(image.fit === "cover" ? "contain" : "cover")}
            aria-pressed={image.fit === "contain"}
          >
            {image.fit === "cover" ? "Fit" : "Fill"}
          </button>
          <button type="button" onClick={onRemove}>
            Remove
          </button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </div>
  );
}
