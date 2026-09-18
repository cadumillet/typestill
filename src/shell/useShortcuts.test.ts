import { describe, expect, it } from "vitest";
import { keyLabel } from "./keys";
import {
  shortcutFor,
  shortcutLabel,
  shortcutRepeats,
  type FocusContext,
  type ShortcutKey,
} from "./useShortcuts";

const press = (code: string, mods: Partial<ShortcutKey> = {}): ShortcutKey => ({
  key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code,
  code,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
});

const alt = (code: string, mods: Partial<ShortcutKey> = {}) =>
  press(code, { altKey: true, ...mods });

const focus = (patch: Partial<FocusContext> = {}): FocusContext => ({
  inEditor: false,
  inNativeField: false,
  inDialog: false,
  inExcalidrawText: false,
  ...patch,
});

describe("shortcutFor", () => {
  it("maps Alt chords to the page and panel actions", () => {
    expect(shortcutFor(alt("ArrowUp"), focus())).toBe("previousPage");
    expect(shortcutFor(alt("ArrowDown"), focus())).toBe("nextPage");
    expect(shortcutFor(alt("KeyN"), focus())).toBe("newLinedPage");
    expect(shortcutFor(alt("KeyN", { shiftKey: true }), focus())).toBe("newZinePage");
    expect(shortcutFor(alt("Backslash"), focus())).toBe("togglePanel");
  });

  it("matches letters by physical key, since Option changes the character on a Mac", () => {
    expect(shortcutFor(alt("KeyN", { key: "Dead" }), focus())).toBe("newLinedPage");
    expect(shortcutFor(alt("KeyN", { key: "˜", shiftKey: true }), focus())).toBe("newZinePage");
    expect(shortcutFor(alt("Backslash", { key: "«" }), focus())).toBe("togglePanel");
  });

  it("works with the caret in the page editor and with nothing focused", () => {
    expect(shortcutFor(alt("ArrowDown"), focus({ inEditor: true }))).toBe("nextPage");
    expect(shortcutFor(alt("KeyN"), focus({ inEditor: true }))).toBe("newLinedPage");
    expect(shortcutFor(alt("Backslash"), focus())).toBe("togglePanel");
  });

  it("stays out of native fields, dialogs and Excalidraw text editing", () => {
    for (const context of [
      focus({ inNativeField: true }),
      focus({ inDialog: true }),
      focus({ inExcalidrawText: true }),
      focus({ inEditor: true, inDialog: true }),
    ]) {
      expect(shortcutFor(alt("ArrowDown"), context)).toBeNull();
      expect(shortcutFor(alt("KeyN"), context)).toBeNull();
      expect(shortcutFor(alt("Backslash"), context)).toBeNull();
    }
  });

  it("leaves plain keys and Cmd/Ctrl chords alone", () => {
    expect(shortcutFor(press("ArrowDown"), focus())).toBeNull();
    expect(shortcutFor(press("ArrowLeft"), focus({ inEditor: true }))).toBeNull();
    expect(shortcutFor(press("KeyN"), focus())).toBeNull();
    expect(shortcutFor(press("KeyB", { metaKey: true }), focus({ inEditor: true }))).toBeNull();
    expect(shortcutFor(press("KeyK", { metaKey: true }), focus())).toBeNull();
    expect(shortcutFor(press("KeyF", { ctrlKey: true }), focus())).toBeNull();
    expect(shortcutFor(press("Quote", { metaKey: true }), focus())).toBeNull();
    expect(
      shortcutFor(press("KeyL", { metaKey: true, shiftKey: true }), focus({ inEditor: true })),
    ).toBeNull();
  });

  it("ignores Alt chords that carry Cmd or Ctrl, or an unbound key", () => {
    expect(shortcutFor(alt("ArrowDown", { metaKey: true }), focus())).toBeNull();
    expect(shortcutFor(alt("ArrowLeft", { metaKey: true }), focus())).toBeNull();
    expect(shortcutFor(alt("KeyN", { ctrlKey: true }), focus())).toBeNull();
    expect(shortcutFor(alt("ArrowLeft"), focus())).toBeNull();
    expect(shortcutFor(alt("ArrowRight"), focus())).toBeNull();
    expect(shortcutFor(alt("ArrowUp", { shiftKey: true }), focus())).toBeNull();
    expect(shortcutFor(alt("Backslash", { shiftKey: true }), focus())).toBeNull();
    expect(shortcutFor(alt("KeyP"), focus())).toBeNull();
  });
});

describe("shortcutRepeats", () => {
  it("lets a held key flip pages but not create them", () => {
    expect(shortcutRepeats("previousPage")).toBe(true);
    expect(shortcutRepeats("nextPage")).toBe(true);
    expect(shortcutRepeats("newLinedPage")).toBe(false);
    expect(shortcutRepeats("newZinePage")).toBe(false);
    expect(shortcutRepeats("togglePanel")).toBe(false);
  });
});

describe("shortcut labels", () => {
  it("shows Mac glyphs and Alt+ words elsewhere", () => {
    expect(shortcutLabel("previousPage", true)).toBe("⌥↑");
    expect(shortcutLabel("nextPage", true)).toBe("⌥↓");
    expect(shortcutLabel("newLinedPage", true)).toBe("⌥N");
    expect(shortcutLabel("newZinePage", true)).toBe("⌥⇧N");
    expect(shortcutLabel("togglePanel", true)).toBe("⌥\\");
    expect(shortcutLabel("previousPage", false)).toBe("Alt+↑");
    expect(shortcutLabel("newZinePage", false)).toBe("Alt+Shift+N");
    expect(shortcutLabel("togglePanel", false)).toBe("Alt+\\");
  });

  it("labels the format bar's Cmd chords the same way", () => {
    expect(keyLabel({ mod: true, key: "B" }, true)).toBe("⌘B");
    expect(keyLabel({ mod: true, shift: true, key: "L" }, true)).toBe("⌘⇧L");
    expect(keyLabel({ mod: true, key: "B" }, false)).toBe("Ctrl+B");
    expect(keyLabel({ mod: true, shift: true, key: "L" }, false)).toBe("Ctrl+Shift+L");
  });
});
