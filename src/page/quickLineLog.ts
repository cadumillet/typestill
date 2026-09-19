// The quick line's action log: what Cmd+Z walks on a page. Quick lines are not
// document steps, so the editor's history cannot take them back, and the drawing
// editor's history starts with its editor; the page keeps its own log instead, one
// entry per quick line (with the element's id) and one per text edit, in the order they
// happened, in memory, per page and per tab. Pure; the hook (useQuickLine.ts) owns one.

export type LogEntry = { kind: "line"; id: string } | { kind: "text" };

/** What an undo does: remove a line, leave the editor to undo text, or nothing. */
export type UndoStep = LogEntry | null;

/** The log with `entry` on top. Leaves the input alone. */
export function push(log: readonly LogEntry[], entry: LogEntry): LogEntry[] {
  return [...log, entry];
}

/**
 * The step an undo takes and the log after it. A `line` on top is the step. A `text` on
 * top is the step when the focused editor can still undo (`undoDepth` above zero);
 * the editor groups typing into steps of its own, so `text` entries can outnumber them,
 * and one the editor has nothing left for is discarded and the next looked at. An empty
 * log is no step.
 */
export function popForUndo(
  log: readonly LogEntry[],
  undoDepth: number,
): { log: LogEntry[]; step: UndoStep } {
  const rest = [...log];
  while (rest.length > 0) {
    const top = rest[rest.length - 1];
    if (top.kind === "line") return { log: rest.slice(0, -1), step: top };
    rest.pop();
    if (undoDepth > 0) return { log: rest, step: top };
  }
  return { log: rest, step: null };
}

/** The log without its top `line` entry, and that entry, for a right click; text stays. */
export function popLine(log: readonly LogEntry[]): { log: LogEntry[]; step: UndoStep } {
  const top = log[log.length - 1];
  if (top?.kind === "line") return { log: log.slice(0, -1), step: top };
  return { log: [...log], step: null };
}
