import { describe, expect, it } from "vitest";
import { popForUndo, popLine, push, type LogEntry } from "./quickLineLog";

const line = (id: string): LogEntry => ({ kind: "line", id });
const text: LogEntry = { kind: "text" };

describe("quick line log", () => {
  it("pushes entries in order, leaving the input alone", () => {
    const log = push(push([], line("a")), text);
    expect(log).toEqual([line("a"), text]);
    const more = push(log, line("b"));
    expect(more).toHaveLength(3);
    expect(log).toHaveLength(2);
  });

  it("undoes a line on top whatever the editor's depth", () => {
    expect(popForUndo([text, line("a")], 0)).toEqual({ log: [text], step: line("a") });
    expect(popForUndo([text, line("a")], 3)).toEqual({ log: [text], step: line("a") });
  });

  it("leaves text on top to the editor while it can undo", () => {
    expect(popForUndo([line("a"), text], 1)).toEqual({ log: [line("a")], step: text });
    expect(popForUndo([line("a"), text, text], 2)).toEqual({ log: [line("a"), text], step: text });
  });

  it("discards text the editor has nothing left for and looks further", () => {
    // Two text entries for one editor step already undone: both go, the line is the step.
    expect(popForUndo([line("a"), text, text], 0)).toEqual({ log: [], step: line("a") });
    // Nothing but text and an empty editor history: nothing to do, the log emptied.
    expect(popForUndo([text, text], 0)).toEqual({ log: [], step: null });
  });

  it("does nothing on an empty log", () => {
    expect(popForUndo([], 0)).toEqual({ log: [], step: null });
    expect(popForUndo([], 5)).toEqual({ log: [], step: null });
  });

  it("pops only a line for a right click, never text", () => {
    expect(popLine([text, line("a")])).toEqual({ log: [text], step: line("a") });
    expect(popLine([line("a"), text])).toEqual({ log: [line("a"), text], step: null });
    expect(popLine([])).toEqual({ log: [], step: null });
  });
});
