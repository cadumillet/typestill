/** Whether the browser runs on an Apple platform, where shortcuts are shown as glyphs. */
export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/** A key with its modifiers; `mod` is Cmd on a Mac and Ctrl elsewhere. */
export interface KeyChord {
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** The key as shown: a capital letter, an arrow glyph or a punctuation character. */
  key: string;
}

/**
 * The label a tooltip shows for a chord: "⌘⇧L" or "⌥↑" on a Mac, "Ctrl+Shift+L" or
 * "Alt+↑" elsewhere.
 */
export function keyLabel({ mod, alt, shift, key }: KeyChord, mac: boolean = isMac): string {
  if (mac) return `${mod ? "⌘" : ""}${alt ? "⌥" : ""}${shift ? "⇧" : ""}${key}`;
  return [mod && "Ctrl", alt && "Alt", shift && "Shift", key].filter(Boolean).join("+");
}
