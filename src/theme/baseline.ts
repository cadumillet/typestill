// Where a font's baseline sits inside a line box, measured rather than hand-tuned, so any
// font lands on the rules. With `line-height` set on the line, the browser centres the
// font's content area (ascent plus descent) in the line box, so the baseline is at half
// the line height plus half the difference between ascent and descent. The browser
// reports both from a canvas text measurement once the font has loaded.

import { useEffect, useState } from "react";
import type { Font } from "./theme";

/** Baseline offset from the top of a line box, in the units of the arguments. */
export function baselineFromMetrics(ascent: number, descent: number, lineHeight: number): number {
  return lineHeight / 2 + (ascent - descent) / 2;
}

/** The baseline offset the fallback ratio gives, used until the font is measured. */
export const FALLBACK_BASELINE = 0.7;

const cache = new Map<string, number>();

/** The font string a measurement or a load uses. */
const fontString = (font: Font, sizePx: number) => `${sizePx}px "${font.family}"`;
/**
 * What is measured, and what a load is asked for: a subset font (Excalifont ships as
 * unicode-range subsets) only counts as loaded for the characters it covers.
 */
const SAMPLE = "Hg";

/** Whether the font is loaded for the sample, so a measurement is of it and not a fallback. */
const loaded = (font: Font, sizePx: number) =>
  !("fonts" in document) || document.fonts.check(fontString(font, sizePx), SAMPLE);

/**
 * Measures the baseline offset of `font` at `sizePx` inside a line `lineHeightPx` tall.
 * Synchronous: measures whatever the browser has, and caches the result only once the
 * font itself is loaded.
 */
export function measureBaseline(font: Font, sizePx: number, lineHeightPx: number): number {
  const key = `${fontString(font, sizePx)}@${lineHeightPx}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return lineHeightPx * FALLBACK_BASELINE;
  context.font = fontString(font, sizePx);
  const metrics = context.measureText(SAMPLE);
  const offset = baselineFromMetrics(
    metrics.fontBoundingBoxAscent,
    metrics.fontBoundingBoxDescent,
    lineHeightPx,
  );
  if (loaded(font, sizePx)) cache.set(key, offset);
  return offset;
}

/** Loads the font for the sample and measures, so later synchronous reads hit the cache. */
export async function primeBaseline(
  font: Font,
  sizePx: number,
  lineHeightPx: number,
): Promise<number> {
  if ("fonts" in document) await document.fonts.load(fontString(font, sizePx), SAMPLE);
  return measureBaseline(font, sizePx, lineHeightPx);
}

/**
 * The baseline offset for a font at a size, in px from the top of the line box. Starts
 * from the cached measurement when there is one, else from the fallback ratio, and
 * settles on the measured value once the font has loaded.
 */
export function useBaseline(font: Font, sizePx: number, lineHeightPx: number): number {
  const key = `${fontString(font, sizePx)}@${lineHeightPx}`;
  const [measured, setMeasured] = useState<{ key: string; offset: number } | null>(() => {
    const cached = cache.get(key);
    return cached === undefined ? null : { key, offset: cached };
  });

  useEffect(() => {
    let cancelled = false;
    const load = "fonts" in document ? document.fonts.load(fontString(font, sizePx), SAMPLE) : null;
    Promise.resolve(load)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        setMeasured({ key, offset: measureBaseline(font, sizePx, lineHeightPx) });
      });
    return () => {
      cancelled = true;
    };
  }, [font, sizePx, lineHeightPx, key]);

  if (measured?.key === key) return measured.offset;
  return cache.get(key) ?? lineHeightPx * FALLBACK_BASELINE;
}
