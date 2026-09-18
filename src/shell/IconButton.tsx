import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /** Accessible name, also shown as the hover tooltip. */
  label: string;
  /** Keyboard shortcut shown after the label in the tooltip, e.g. "⌘J". */
  shortcut?: string;
  pressed?: boolean;
  /**
   * Off: looks disabled and does nothing on click, but keeps its tooltip (a disabled
   * button has none), so the tooltip can say why. Give it the reason through `label`.
   */
  off?: boolean;
  children: ReactNode;
}

/** An icon-only button with a tooltip on hover (see .icon-button in app.css). */
export function IconButton({
  label,
  shortcut,
  pressed,
  off = false,
  children,
  className,
  onClick,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={["icon-button", off ? "is-off" : "", className].filter(Boolean).join(" ")}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={off || undefined}
      data-tooltip={shortcut ? `${label} ${shortcut}` : label}
      onClick={off ? undefined : onClick}
      {...rest}
    >
      {children}
    </button>
  );
}
