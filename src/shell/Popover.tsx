import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "./popover.css";

export interface PopoverProps {
  /** The trigger. Receives whether the popover is open. */
  trigger: (props: { open: boolean; toggle: () => void; controls: string }) => ReactNode;
  children: ReactNode;
  /** Which edge of the trigger the popover aligns to. */
  align?: "left" | "right";
  /** Extra class for the wrapper, for placing it in a layout. */
  className?: string;
  /** Given, the popover is controlled: the caller owns whether it is open. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * A trigger with a floating panel below it. Closes on outside click or Escape. Owns its
 * open state unless the caller passes `open`, for popovers a shortcut can open.
 */
export function Popover({
  trigger,
  children,
  align = "right",
  className,
  open: controlledOpen,
  onOpenChange,
}: PopoverProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOwnOpen(false);
      onOpenChange?.(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div className={["popover", className].filter(Boolean).join(" ")} ref={ref}>
      {trigger({ open, toggle: () => setOpen(!open), controls: id })}
      {open && (
        <div className={`popover__panel popover__panel--${align}`} id={id}>
          {children}
        </div>
      )}
    </div>
  );
}
