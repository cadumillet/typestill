import { useEffect, useLayoutEffect, useRef } from "react";
import { isMac, keyLabel } from "./keys";

export type ShortcutAction =
  "previousPage" | "nextPage" | "newLinedPage" | "newZinePage" | "togglePanel";

/** The parts of a KeyboardEvent the shortcuts look at. */
export interface ShortcutKey {
  key: string;
  /** The physical key; letters are matched by it because Alt changes `key` on a Mac. */
  code: string;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/** Where the keyboard focus is when a key is pressed. */
export interface FocusContext {
  /** The caret is in a page's text editor. Shortcuts work there. */
  inEditor: boolean;
  /** A native input, textarea or select has focus; it keeps every key. */
  inNativeField: boolean;
  /** A dialog is open; it keeps every key. */
  inDialog: boolean;
  /** An Excalidraw text element is being edited; the canvas keeps every key. */
  inExcalidrawText: boolean;
}

interface Binding {
  action: ShortcutAction;
  code: string;
  shift: boolean;
  /** The key as the tooltip shows it. */
  label: string;
  repeats: boolean;
}

/**
 * Every shortcut is Alt plus a key (Option on a Mac), with no Cmd or Ctrl: Alt chords
 * are the ones the browser, ProseMirror and Excalidraw leave alone. Arrows are up and
 * down rather than left and right because Option+←/→ are word jumps in the editor on a
 * Mac and Alt+←/→ are history in the browser elsewhere; up and down also follow the
 * rail, which stacks the pages vertically.
 */
const BINDINGS: Binding[] = [
  { action: "previousPage", code: "ArrowUp", shift: false, label: "↑", repeats: true },
  { action: "nextPage", code: "ArrowDown", shift: false, label: "↓", repeats: true },
  { action: "newLinedPage", code: "KeyN", shift: false, label: "N", repeats: false },
  { action: "newZinePage", code: "KeyN", shift: true, label: "N", repeats: false },
  { action: "togglePanel", code: "Backslash", shift: false, label: "\\", repeats: false },
];

/**
 * The action a key press stands for, or null. Nothing fires while a native field, a
 * dialog or an Excalidraw text element has the keyboard; the page editor and an
 * unfocused page both get every shortcut.
 */
export function shortcutFor(event: ShortcutKey, context: FocusContext): ShortcutAction | null {
  if (context.inNativeField || context.inDialog || context.inExcalidrawText) return null;
  if (!event.altKey || event.metaKey || event.ctrlKey) return null;
  const binding = BINDINGS.find((b) => b.code === event.code && b.shift === event.shiftKey);
  return binding?.action ?? null;
}

/** Whether holding the key repeats the action. Page flips do; creating pages does not. */
export function shortcutRepeats(action: ShortcutAction): boolean {
  return BINDINGS.some((b) => b.action === action && b.repeats);
}

/** The shortcut's label for a tooltip: "⌥↑" on a Mac, "Alt+↑" elsewhere. */
export function shortcutLabel(action: ShortcutAction, mac: boolean = isMac): string {
  const binding = BINDINGS.find((b) => b.action === action);
  if (!binding) throw new Error(`No shortcut for ${action}`);
  return keyLabel({ alt: true, shift: binding.shift, key: binding.label }, mac);
}

/** Reads the focus context off the element that has the keyboard. */
export function focusContextOf(active: Element | null): FocusContext {
  const element = active instanceof HTMLElement ? active : null;
  const tag = element?.tagName;
  return {
    inEditor: element?.isContentEditable ?? false,
    inNativeField: tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT",
    inDialog: document.querySelector("dialog[open]") !== null,
    inExcalidrawText: element?.classList.contains("excalidraw-wysiwyg") ?? false,
  };
}

/**
 * Listens for the shell's shortcuts on the document, in the capture phase so that a
 * matched chord is the shell's alone: the browser, the page editor and Excalidraw never
 * see it. Actions without a handler are left to their default.
 */
export function useShortcuts(handlers: Partial<Record<ShortcutAction, () => void>>): void {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const action = shortcutFor(event, focusContextOf(document.activeElement));
      if (!action) return;
      const handler = latest.current[action];
      if (!handler) return;
      event.preventDefault();
      event.stopPropagation();
      // A held key flips pages; it must not pile up new ones.
      if (!event.repeat || shortcutRepeats(action)) handler();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
