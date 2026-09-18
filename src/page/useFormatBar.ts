import { useCallback, useRef, useState, type RefObject } from "react";
import type { ColumnHandle, ColumnSelection } from "./Column";
import type { FormatAction, FormatState } from "./editor/commands";

/** The selection the format bar is shown for, in page coordinates. */
export interface BarSelection {
  column: number;
  anchor: { top: number; bottom: number; left: number; right: number };
  format: FormatState;
}

/**
 * Page-level state for the floating format bar: which column's selection it shows,
 * where, and how to reach that column's editor. Shared by every page kind that holds
 * text columns.
 */
export function useFormatBar(page: RefObject<HTMLDivElement | null>) {
  const editors = useRef<(ColumnHandle | null)[]>([]);
  const [selection, setSelection] = useState<BarSelection | null>(null);

  // The bar is placed in page coordinates. A column clearing its selection must not
  // hide the bar another column owns.
  const setColumnSelection = useCallback(
    (index: number, at: ColumnSelection | null) => {
      const box = page.current?.getBoundingClientRect();
      setSelection((current) => {
        if (!at || !box) return current?.column === index ? null : current;
        return {
          column: index,
          anchor: {
            top: at.top - box.top,
            bottom: at.bottom - box.top,
            left: at.left - box.left,
            right: at.right - box.left,
          },
          format: at.format,
        };
      });
    },
    [page],
  );

  const bindEditor = useCallback(
    (index: number) => (handle: ColumnHandle | null) => {
      editors.current[index] = handle;
    },
    [],
  );

  const onAction = useCallback(
    (action: FormatAction) => {
      if (selection) editors.current[selection.column]?.format(action);
    },
    [selection],
  );

  return { selection, setColumnSelection, bindEditor, onAction };
}
