import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { columnFromText, type Column } from "../page/document";
import { createAutosave, columnsKey, elementsKey } from "./autosave";
import { element } from "./fixtures";

const columns = (...texts: string[]): Column[] => texts.map(columnFromText);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("keys", () => {
  it("elementsKey changes with versions and ignores deleted elements", () => {
    const a = elementsKey([element("a", { version: 1 })]);
    expect(elementsKey([element("a", { version: 2 })])).not.toBe(a);
    expect(elementsKey([element("a", { version: 1 }), element("b", { isDeleted: true })])).toBe(a);
  });

  it("columnsKey distinguishes columns from paragraphs and sees formatting", () => {
    expect(columnsKey(columns("a", "b"))).not.toBe(columnsKey(columns("a\nb")));
    expect(columnsKey(columns("a", "b"))).toBe(columnsKey(columns("a", "b")));
    const bold = columnFromText("a");
    bold.doc.content[0].content![0].marks = [{ type: "bold" }];
    expect(columnsKey([bold])).not.toBe(columnsKey(columns("a")));
  });
});

describe("createAutosave", () => {
  const make = (save: (value: string[]) => Promise<void>, delayMs = 100, onError?: () => void) =>
    createAutosave<string[]>({ save, key: (value) => JSON.stringify(value), delayMs, onError });

  it("coalesces a burst of changes into one save after the delay", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = make(save);
    autosave.onChange(["h"]);
    autosave.onChange(["he"]);
    autosave.onChange(["hel"]);
    await vi.advanceTimersByTimeAsync(99);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(["hel"]);
  });

  it("skips changes that do not alter the content", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = make(save);
    autosave.markClean(["same"]);
    autosave.onChange(["same"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(save).not.toHaveBeenCalled();
  });

  it("flushes immediately and does not save the same state twice", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = make(save);
    autosave.onChange(["a"]);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await autosave.flush();
    autosave.onChange(["a"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reports save errors and keeps working", async () => {
    const onError = vi.fn();
    const save = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const autosave = make(save, 10, onError);
    autosave.onChange(["a"]);
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    autosave.onChange(["ab"]);
    await vi.advanceTimersByTimeAsync(10);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("dispose drops pending changes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = make(save, 10);
    autosave.onChange(["a"]);
    autosave.dispose();
    await vi.advanceTimersByTimeAsync(50);
    expect(save).not.toHaveBeenCalled();
  });
});
