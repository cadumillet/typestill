import { useEffect, useState } from "react";

export interface Size {
  width: number;
  height: number;
}

/**
 * Tracks an element's content box size. Returns a callback ref to attach to the element
 * and the latest size (null until the element has been measured).
 */
export function useElementSize<T extends HTMLElement>(): [(node: T | null) => void, Size | null] {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, size];
}
