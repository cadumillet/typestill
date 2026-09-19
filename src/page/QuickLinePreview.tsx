import { Arrow, Ellipse, Line, Rectangle } from "../shell/icons";
import { boxOf, type QuickElement } from "./quickLine";
import type { QuickLinePreview as Preview } from "./useQuickLine";
import "./quickline.css";

export interface QuickLinePreviewProps {
  preview: Preview;
  /** CSS px per scene px: the stroke width is in scene px. */
  zoom: number;
}

/** The arrowhead's size in px, at the stroke's width. */
const ARROWHEAD = 4;

/**
 * The shape being dragged, drawn in an SVG over the page in page px, in the stroke it
 * will have and with no fill: a line, a rectangle or ellipse on the drag's box, or a
 * line with an arrowhead at its end. Editing chrome (`page-chrome`): the renderer
 * strips it, so it never enters a thumbnail or an export.
 */
export function QuickLinePreview({ preview, zoom }: QuickLinePreviewProps) {
  const { start, end, stroke, element } = preview;
  const width = stroke.strokeWidth * zoom;
  const box = boxOf(start, end);
  return (
    <svg className="quick-line page-chrome" aria-hidden="true">
      {element === "arrow" && (
        <defs>
          <marker
            id="quick-line-arrowhead"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth={ARROWHEAD}
            markerHeight={ARROWHEAD}
            orient="auto-start-reverse"
          >
            <path d="M1 1L9 5L1 9" fill="none" stroke={stroke.strokeColor} strokeWidth={1.5} />
          </marker>
        </defs>
      )}
      {element === "rectangle" && (
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill="none"
          stroke={stroke.strokeColor}
          strokeWidth={width}
        />
      )}
      {element === "ellipse" && (
        <ellipse
          cx={box.x + box.width / 2}
          cy={box.y + box.height / 2}
          rx={box.width / 2}
          ry={box.height / 2}
          fill="none"
          stroke={stroke.strokeColor}
          strokeWidth={width}
        />
      )}
      {(element === "line" || element === "arrow") && (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={stroke.strokeColor}
          strokeWidth={width}
          strokeLinecap="round"
          markerEnd={element === "arrow" ? "url(#quick-line-arrowhead)" : undefined}
        />
      )}
    </svg>
  );
}

const NAMES: Record<QuickElement, string> = {
  line: "Line",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  arrow: "Arrow",
};

const ICONS: Record<QuickElement, () => React.JSX.Element> = {
  line: Line,
  rectangle: Rectangle,
  ellipse: Ellipse,
  arrow: Arrow,
};

/**
 * The indicator on the armed page: a pill at its top-right with the element's icon and
 * name, so what the next drag will draw is never a guess. Chrome, stripped from renders.
 */
export function QuickElementIndicator({ element }: { element: QuickElement }) {
  const Icon = ICONS[element];
  return (
    <span className="quick-line__element page-chrome" aria-live="polite">
      <Icon />
      {NAMES[element]}
    </span>
  );
}
