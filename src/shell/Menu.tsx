import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import { Popover } from "./Popover";
import "./menu.css";

export interface MenuItem {
  label: string;
  onSelect: () => void;
}

export interface MenuProps {
  /** Icon for the trigger button. */
  children: ReactNode;
  label: string;
  items: MenuItem[];
}

/** An icon button that opens a small list of actions below it. */
export function Menu({ children, label, items }: MenuProps) {
  return (
    <Popover
      trigger={({ open, toggle, controls }) => (
        <IconButton
          label={label}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={controls}
        >
          {children}
        </IconButton>
      )}
    >
      <ul className="menu__list" role="menu">
        {items.map((item) => (
          <li key={item.label} role="none">
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              onClick={() => {
                item.onSelect();
                // The popover closes on the outside pointerdown that follows a selection
                // elsewhere; for keyboard users the Escape key closes it.
                document.dispatchEvent(new PointerEvent("pointerdown"));
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
