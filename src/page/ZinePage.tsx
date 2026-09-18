import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
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
import type { Theme } from "../theme/theme";
import { isDarkTheme } from "../theme/themes";
import { DrawingStill } from "./DrawingStill";
import { drawingModeStyle, type DrawingAids } from "./drawingMode";
import { FormatBar } from "./FormatBar";
import { mmToCssPx, pageMm, type Orientation, type PageSize } from "./paper";
import { pageLookStyle } from "./pageLook";
import type { PageSide } from "./sides";
import { useFormatBar } from "./useFormatBar";
import {
  MAX_ZINE_TEXT_ROWS,
  MEDIA_LAYOUTS,
  addBlock,
  defaultCell,
  hasWriting,
  imagesForLayout,
  isMediaBlock,
  mediaBlockFor,
  mediaBlockOf,
  mediaCells,
  mediaLayoutOf,
  removeBlock,
  replaceBlock,
  withMediaCells,
  zineGeometry,
  zineOptions,
  type AddPlace,
  type BlockAddress,
  type BlockGeometry,
  type Box,
  type MediaBlock,
  type MediaLayout,
  type TextBlock,
  type Zine,
  type ZineBlockKind,
  type ZineImage,
} from "./zine";
import "./textpage.css";
import "./zinepage.css";

export interface ZinePageProps {
  size: PageSize;
  orientation: Orientation;
  /** The look of the page: the zine font, the row pitch, colours. */
  theme: Theme;
  /** CSS px per scene px. Sets the rendered size of the page. */
  zoom: number;
  zine: Zine;
  /** The notebook's files, for the images the media block shows. */
  files: Record<string, BinaryFileData>;
  /** Preview: placeholders hidden, no editing. */
  preview?: boolean;
  readOnly?: boolean;
  /** The page's side, which rounds its outer corners; none for a rectangular render. */
  side?: PageSide;
  /** The page's drawing, shown as a still over the blocks; empty for none. */
  drawing?: readonly ExcalidrawElement[];
  /** Drawing mode, with its viewing aids: the page is locked and shows no still. */
  drawingMode?: DrawingAids | null;
  onChange?: (zine: Zine) => void;
  /** Image files dropped, pasted or picked; null when pasted with every cell full. */
  onAddImages?: (cell: number | null, files: File[]) => void;
  /** An image dragged from the media pool onto a cell. */
  onPlaceFile?: (cell: number, fileId: string) => void;
  /** The cell chosen by clicking it: where a paste, or a click in the pool, lands. */
  selectedCell?: number | null;
  onSelectCell?: (cell: number | null) => void;
}

const NO_ELEMENTS: readonly ExcalidrawElement[] = [];

const KIND_LABELS: Record<ZineBlockKind, string> = { image: "Image", grid: "Grid", text: "Text" };

const LAYOUT_LABELS: Record<MediaLayout, string> = {
  single: "One image",
  row: "Two side by side",
  column: "Two stacked",
  square: "Two by two",
};

/** Height of the "add below" strip and width of the "add beside" strips, in CSS px. */
const ADD_ZONE_PX = 40;

/**
 * A zine page: rows of blocks composed in place. Hovering an empty page offers the
 * first block; hovering under the last row offers what can go beneath; hovering the
 * media block's edges offers a text block beside it; every block has its own tools.
 * Nothing is dragged into position: images land in cells by drop, paste or the file
 * picker, and text blocks are the same editor as lined pages without rules, in the
 * zine typeface.
 */
export function ZinePage({
  size,
  orientation,
  theme,
  zoom,
  zine,
  files,
  preview = false,
  readOnly = false,
  side,
  drawing = NO_ELEMENTS,
  drawingMode = null,
  onChange,
  onAddImages,
  onPlaceFile,
  selectedCell = null,
  onSelectCell,
}: ZinePageProps) {
  const mm = pageMm(size, orientation);
  const px = (value: number) => mmToCssPx(value, zoom);
  const pitchMm = theme.lined.pitchMm;
  const pitch = px(pitchMm);
  const page = useRef<HTMLDivElement>(null);
  const bar = useFormatBar(page);
  const [fullBlocks, setFullBlocks] = useState<boolean[]>([]);
  const [over, setOver] = useState(false);
  const locked = preview || readOnly || drawingMode !== null;

  const setBlockFull = useCallback((index: number, full: boolean) => {
    setFullBlocks((current) => {
      if (current[index] === full) return current;
      const next = [...current];
      next[index] = full;
      return next;
    });
  }, []);

  const geometry = zineGeometry(mm, zine, pitchMm, theme.lined.textInsetMm);
  const options = zineOptions(zine);
  const media = mediaBlockOf(zine);
  const change = (next: Zine) => onChange?.(next);

  const setCell = (cell: number, image: ZineImage | null) => {
    if (!media) return;
    const images = [...mediaCells(media.block)];
    images[cell] = image;
    change(replaceBlock(zine, media, withMediaCells(media.block, images)));
  };

  // Settings that would drop images or writing ask first; nothing is untied silently.
  const setLayout = (at: BlockAddress, block: MediaBlock, layout: MediaLayout) => {
    if (layout === mediaLayoutOf(block)) return;
    const images = imagesForLayout(mediaCells(block), layout);
    const dropped = mediaCells(block).slice(images.length).filter(Boolean).length;
    if (
      dropped > 0 &&
      !window.confirm(
        `This layout has fewer cells. ${dropped === 1 ? "One image" : `${dropped} images`} will be taken off the page (they stay in the notebook). Continue?`,
      )
    ) {
      return;
    }
    change(replaceBlock(zine, at, mediaBlockFor(layout, images)));
  };

  const remove = (at: BlockAddress, block: BlockGeometry["block"]) => {
    if (isMediaBlock(block)) {
      const count = mediaCells(block).filter(Boolean).length;
      if (
        count > 0 &&
        !window.confirm(
          `Remove this block? ${count === 1 ? "Its image stays" : `Its ${count} images stay`} in the media pool.`,
        )
      ) {
        return;
      }
    } else if (
      hasWriting(block) &&
      !window.confirm("This text block has writing in it. Remove it?")
    ) {
      return;
    }
    change(removeBlock(zine, at));
  };

  const setRows = (at: BlockAddress, block: TextBlock, rows: number) => {
    const next = Math.min(MAX_ZINE_TEXT_ROWS, Math.max(1, rows));
    if (next !== block.rows) change(replaceBlock(zine, at, { ...block, rows: next }));
  };

  const add = (place: AddPlace, kind: ZineBlockKind) =>
    change(addBlock(zine, place, kind, theme.zine));

  // Images pasted anywhere on the page go to the chosen cell, else the first empty one;
  // with no media block yet, they make one. Text pastes are left to the editors.
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (locked) return;
    const images = imageFilesOf(event.clipboardData);
    if (images.length === 0) return;
    event.preventDefault();
    onAddImages?.(selectedCell ?? defaultCell(zine) ?? (media ? null : 0), images);
  };

  // A page with no media block takes drops of files or pool images, and makes one.
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    setOver(false);
    if (locked || media) return;
    const fileId = event.dataTransfer.getData(POOL_DRAG_TYPE);
    if (fileId) {
      event.preventDefault();
      onPlaceFile?.(0, fileId);
      return;
    }
    const dropped = imageFilesOf(event.dataTransfer);
    if (dropped.length === 0) return;
    event.preventDefault();
    onAddImages?.(0, dropped);
  };

  const style = {
    ...pageLookStyle(theme, theme.zine.font, zoom),
    width: px(mm.width),
    height: px(mm.height),
    "--rule-pitch": `${pitch}px`,
    "--font-size": `${pitch / theme.zine.font.lineHeight}px`,
    ...(drawingMode ? drawingModeStyle(drawingMode) : {}),
  } as CSSProperties;

  const boxStyle = (box: Box): CSSProperties => ({
    left: px(box.left),
    top: px(box.top),
    width: px(box.width),
    height: px(box.height),
  });

  const className = [
    "text-page",
    "zine-page",
    theme.page.border ? "has-border" : "",
    preview ? "is-preview" : "",
    side ? `side-${side}` : "",
    over ? "is-over" : "",
    drawingMode ? "is-drawing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const blocks = geometry.rows.flat();
  const lastRow = geometry.rows[geometry.rows.length - 1];
  const besideBlock =
    options.beside !== null
      ? geometry.rows[options.beside].find((b) => isMediaBlock(b.block))
      : null;
  let textIndex = 0;

  return (
    <div
      className={className}
      style={style}
      ref={page}
      onPaste={onPaste}
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest(".zine-cell")) onSelectCell?.(null);
      }}
      onDragOver={(event) => {
        if (locked || media) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {!drawingMode && (
        <DrawingStill
          elements={drawing}
          files={files}
          size={size}
          orientation={orientation}
          inverted={isDarkTheme(theme)}
          width={px(mm.width)}
          height={px(mm.height)}
        />
      )}
      {blocks.map((entry) => {
        const { block, at, box } = entry;
        if (isMediaBlock(block)) {
          const cells = mediaCells(block);
          return (
            <div
              key={`${at.row}-${at.index}`}
              className="zine-block zine-block--media"
              style={boxStyle(box)}
            >
              {entry.cells.map((cellBox, index) => (
                <ZineCell
                  key={index}
                  index={index}
                  image={cells[index] ?? null}
                  file={cells[index] ? files[cells[index].fileId] : undefined}
                  style={{
                    left: px(cellBox.left - box.left),
                    top: px(cellBox.top - box.top),
                    width: px(cellBox.width),
                    height: px(cellBox.height),
                  }}
                  locked={locked}
                  preview={preview}
                  selected={selectedCell === index}
                  onSelect={() => onSelectCell?.(index)}
                  onFiles={(dropped) => onAddImages?.(index, dropped)}
                  onPlaceFile={(fileId) => onPlaceFile?.(index, fileId)}
                  onFit={(fit) => setCell(index, { ...cells[index]!, fit })}
                  onRemove={() => setCell(index, null)}
                />
              ))}
              {!locked && (
                <div className="zine-block__tools zine-chrome">
                  <select
                    aria-label="Layout"
                    value={mediaLayoutOf(block)}
                    onChange={(event) => setLayout(at, block, event.target.value as MediaLayout)}
                  >
                    {MEDIA_LAYOUTS.map((layout) => (
                      <option key={layout} value={layout}>
                        {LAYOUT_LABELS[layout]}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => remove(at, block)}>
                    Remove block
                  </button>
                </div>
              )}
            </div>
          );
        }
        const index = textIndex++;
        const ownRow = geometry.rows[at.row].every((b) => !isMediaBlock(b.block));
        const text = entry.text!;
        return (
          <div
            key={`${at.row}-${at.index}`}
            className="zine-block zine-block--text"
            style={boxStyle(box)}
          >
            <Column
              ref={bar.bindEditor(index)}
              value={block.column}
              readOnly={locked}
              lines={entry.lines}
              pitch={pitch}
              style={{
                left: px(text.left - box.left),
                width: px(text.width),
                top: px(text.top - box.top),
                height: entry.lines * pitch,
              }}
              onChange={(column: ColumnValue) =>
                change(replaceBlock(zine, at, { ...block, column }))
              }
              onFull={(full) => setBlockFull(index, full)}
              onSelection={(selection) => bar.setColumnSelection(index, selection)}
            />
            {!locked && fullBlocks[index] && (
              <div className="text-page__full zine-page__full zine-chrome">Text full</div>
            )}
            {!locked && (
              <div className="zine-block__tools zine-chrome">
                {ownRow && (
                  <span className="zine-block__rows">
                    <button
                      type="button"
                      aria-label="Fewer rows"
                      onClick={() => setRows(at, block, block.rows - 1)}
                    >
                      −
                    </button>
                    {block.rows} {block.rows === 1 ? "row" : "rows"}
                    <button
                      type="button"
                      aria-label="More rows"
                      onClick={() => setRows(at, block, block.rows + 1)}
                    >
                      +
                    </button>
                  </span>
                )}
                <button type="button" onClick={() => remove(at, block)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
      {!locked && blocks.length === 0 && (
        <AddSpot
          className="zine-add--first"
          options={options.below}
          onAdd={(kind) => add({ row: "below" }, kind)}
        />
      )}
      {!locked && lastRow && options.below.length > 0 && (
        <AddSpot
          className="zine-add--below"
          style={{
            left: px(geometry.inner.left),
            width: px(geometry.inner.width),
            top: px(lastRow[0].box.top + lastRow[0].box.height) - ADD_ZONE_PX,
            height: ADD_ZONE_PX,
          }}
          options={options.below}
          onAdd={(kind) => add({ row: "below" }, kind)}
        />
      )}
      {!locked &&
        besideBlock &&
        options.beside !== null &&
        (["left", "right"] as const).map((edge) => (
          <AddSpot
            key={edge}
            className={`zine-add--beside zine-add--${edge}`}
            style={{
              left:
                edge === "left"
                  ? px(besideBlock.box.left)
                  : px(besideBlock.box.left + besideBlock.box.width) - ADD_ZONE_PX,
              width: ADD_ZONE_PX,
              top: px(besideBlock.box.top) + ADD_ZONE_PX,
              height: Math.max(0, px(besideBlock.box.height) - 2 * ADD_ZONE_PX),
            }}
            options={["text"]}
            onAdd={(kind) => add({ row: options.beside!, side: edge }, kind)}
          />
        ))}
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

interface AddSpotProps {
  className: string;
  style?: CSSProperties;
  options: readonly ZineBlockKind[];
  onAdd: (kind: ZineBlockKind) => void;
}

/**
 * An affordance for adding a block, shown while its zone is hovered: one choice is a
 * single "+ Text" pill; several are a plus that opens into a pill per choice.
 */
function AddSpot({ className, style, options, onAdd }: AddSpotProps) {
  const [open, setOpen] = useState(false);
  const pick = (kind: ZineBlockKind) => {
    setOpen(false);
    onAdd(kind);
  };
  return (
    <div
      className={`zine-add zine-chrome ${className}${open ? " is-open" : ""}`}
      style={style}
      onPointerLeave={() => setOpen(false)}
    >
      {options.length === 1 ? (
        <button type="button" className="zine-add__pill" onClick={() => pick(options[0])}>
          + {KIND_LABELS[options[0]]}
        </button>
      ) : open ? (
        <span className="zine-add__choices">
          {options.map((kind) => (
            <button key={kind} type="button" className="zine-add__pill" onClick={() => pick(kind)}>
              + {KIND_LABELS[kind]}
            </button>
          ))}
        </span>
      ) : (
        <button
          type="button"
          className="zine-add__plus"
          aria-label="Add a block"
          onClick={() => setOpen(true)}
        >
          +
        </button>
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

/** One cell of the media block: its image with fit, replace and remove controls, or a placeholder. */
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
      event.stopPropagation();
      onPlaceFile(fileId);
      return;
    }
    const files = imageFilesOf(event.dataTransfer);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
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
        event.stopPropagation();
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
      {image && !file && !preview && (
        <div className="zine-cell__missing zine-chrome">Missing image</div>
      )}
      {!image && !preview && (
        <button
          type="button"
          className="zine-cell__add zine-chrome"
          disabled={locked}
          onClick={() => input.current?.click()}
        >
          Add image
        </button>
      )}
      {image && !locked && (
        <div className="zine-cell__tools zine-chrome">
          <button
            type="button"
            onClick={() => onFit(image.fit === "cover" ? "contain" : "cover")}
            aria-pressed={image.fit === "contain"}
          >
            {image.fit === "cover" ? "Fit" : "Fill"}
          </button>
          <button type="button" onClick={() => input.current?.click()}>
            Replace
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
