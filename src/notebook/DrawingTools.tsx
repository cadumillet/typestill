import { IconButton } from "../shell/IconButton";
import { Popover } from "../shell/Popover";
import { Sliders } from "../shell/icons";
import { OPACITIES, type DrawingAids, type Opacity } from "../page/drawingMode";
import "./drawingtools.css";

export interface DrawingToolsProps {
  /** The dimming controls: how much of the text and of the rules shows while drawing. */
  aids: DrawingAids;
  onAidsChange: (patch: Partial<DrawingAids>) => void;
}

const OPACITY_LABELS: Record<Opacity, string> = {
  full: "Full",
  dimmed: "Dim",
  hidden: "Hidden",
};

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
    <div className="drawing-tools__row">
      <span>{label}</span>
      <span className="drawing-tools__segments" role="radiogroup" aria-label={label}>
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
 * The tools that sit with drawing mode, in a popover from the page bar: the "Text" and
 * "Rules" dimming controls, each full, dim or hidden, ways of seeing while drawing that
 * are per browser, never stored with the page or applied to exports.
 */
export function DrawingTools({ aids, onAidsChange }: DrawingToolsProps) {
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
      <div className="drawing-tools">
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
      </div>
    </Popover>
  );
}
