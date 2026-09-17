import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /** Accessible name, also shown as the hover tooltip. */
  label: string;
  /** Keyboard shortcut shown after the label in the tooltip, e.g. "⌘J". */
  shortcut?: string;
  pressed?: boolean;
  children: ReactNode;
}

/** An icon-only button with a tooltip on hover (see .icon-button in app.css). */
export function IconButton({
  label,
  shortcut,
  pressed,
  children,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={["icon-button", className].filter(Boolean).join(" ")}
      aria-label={label}
      aria-pressed={pressed}
      data-tooltip={shortcut ? `${label} ${shortcut}` : label}
      {...rest}
    >
      {children}
    </button>
  );
}
