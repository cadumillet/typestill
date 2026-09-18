import { IconButton } from "../shell/IconButton";
import { Popover } from "../shell/Popover";
import { Sliders } from "../shell/icons";
import { OPACITIES, type DrawingAids, type Opacity } from "../page/drawingMode";
import type { DrawingLayer } from "../store/model";
import "./pagesettings.css";

export interface DrawingToolsProps {
  /** The viewing aids: the opacity of the text and of the rules while drawing. */
  aids: DrawingAids;
  onAidsChange: (patch: Partial<DrawingAids>) => void;
  /** Where the open page's drawing paints in writing mode. */
  layer: DrawingLayer;
  onLayerChange: (layer: DrawingLayer) => void;
}

const OPACITY_LABELS: Record<Opacity, string> = {
  full: "Full",
  dimmed: "Dimmed",
  hidden: "Hidden",
};

const LAYERS: { value: DrawingLayer; label: string }[] = [
  { value: "over", label: "Over the text" },
  { value: "under", label: "Under the text" },
];

function Segments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="page-settings__row page-settings__row--static">
      <span>{label}</span>
      <span className="page-settings__segments" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => value !== option.value && onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * The tools that sit with drawing mode, in a popover from the page bar: the text and
 * rules opacities (per browser, never stored with the page or applied to exports) and
 * the page's drawing layer, over or under the text in writing mode.
 */
export function DrawingTools({ aids, onAidsChange, layer, onLayerChange }: DrawingToolsProps) {
  const opacities = OPACITIES.map((value) => ({ value, label: OPACITY_LABELS[value] }));
  return (
    <Popover
      trigger={({ open, toggle, controls }) => (
        <IconButton
          label="Drawing tools"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={controls}
        >
          <Sliders />
        </IconButton>
      )}
    >
      <div className="page-settings">
        <Segments
          label="Text"
          value={aids.text}
          options={opacities}
          onChange={(text) => onAidsChange({ text })}
        />
        <Segments
          label="Rules"
          value={aids.rules}
          options={opacities}
          onChange={(rules) => onAidsChange({ rules })}
        />
        <Segments label="Drawing" value={layer} options={LAYERS} onChange={onLayerChange} />
      </div>
    </Popover>
  );
}
