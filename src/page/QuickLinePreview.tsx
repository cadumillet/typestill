import type { QuickLinePreview as Preview } from "./useQuickLine";
import "./quickline.css";

export interface QuickLinePreviewProps {
  preview: Preview;
  /** CSS px per scene px: the stroke width is in scene px. */
  zoom: number;
}

/**
 * The line being dragged, drawn in an SVG over the page in page px, in the stroke it
 * will have. Editing chrome (`page-chrome`): the renderer strips it, so it never enters
 * a thumbnail or an export.
 */
export function QuickLinePreview({ preview, zoom }: QuickLinePreviewProps) {
  return (
    <svg className="quick-line page-chrome" aria-hidden="true">
      <line
        x1={preview.start.x}
        y1={preview.start.y}
        x2={preview.end.x}
        y2={preview.end.y}
        stroke={preview.stroke.strokeColor}
        strokeWidth={preview.stroke.strokeWidth * zoom}
        strokeLinecap="round"
      />
    </svg>
  );
}
