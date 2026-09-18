// The app appearance: light, dark or system, for the chrome and the canvas. Not part of
// a theme (themes are page-only) and not part of a notebook: remembered per browser.

import { useEffect, useState } from "react";

export type Appearance = "light" | "dark" | "system";
export const APPEARANCES: readonly Appearance[] = ["light", "dark", "system"];

const STORAGE_KEY = "typestill.appearance";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function storeAppearance(appearance: Appearance): void {
  try {
    if (appearance === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, appearance);
  } catch {
    // Browser storage is a convenience only.
  }
}

/** What "system" resolves to right now. */
function systemScheme(): "light" | "dark" {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveAppearance(appearance: Appearance): "light" | "dark" {
  return appearance === "system" ? systemScheme() : appearance;
}

/**
 * The appearance setting and the scheme it resolves to, applied to the document as
 * data-appearance so the chrome's colour tokens follow. Tracks the system scheme while
 * the setting is "system".
 */
export function useAppearance(): {
  appearance: Appearance;
  scheme: "light" | "dark";
  setAppearance: (appearance: Appearance) => void;
} {
  const [appearance, setState] = useState<Appearance>(readAppearance);
  const [system, setSystem] = useState(systemScheme);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(DARK_QUERY);
    const onChange = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const scheme = appearance === "system" ? system : appearance;

  useEffect(() => {
    document.documentElement.dataset.appearance = scheme;
  }, [scheme]);

  const setAppearance = (next: Appearance) => {
    storeAppearance(next);
    setState(next);
  };

  return { appearance, scheme, setAppearance };
}
