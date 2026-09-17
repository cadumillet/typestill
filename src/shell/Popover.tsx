import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "./popover.css";

export interface PopoverProps {
  /** The trigger. Receives whether the popover is open. */
  trigger: (props: { open: boolean; toggle: () => void; controls: string }) => ReactNode;
  children: ReactNode;
  /** Which edge of the trigger the popover aligns to. */
  align?: "left" | "right";
}

/** A trigger with a floating panel below it. Closes on outside click or Escape. */
export function Popover({ trigger, children, align = "right" }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="popover" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o), controls: id })}
      {open && (
        <div className={`popover__panel popover__panel--${align}`} id={id}>
          {children}
        </div>
      )}
    </div>
  );
}
