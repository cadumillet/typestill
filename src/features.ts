// Feature flags: what the app shows, read once at start. A flag is a build-time
// variable (`VITE_FEATURE_<NAME>`, on unless it is "off"; .env.production turns it off)
// with a per-browser override in local storage ("on" or "off"), so either state can be
// looked at in either build. Flags are temporary and listed in PLAN.md section 8 while
// they exist.

export interface Features {
  /**
   * Zine pages: with the flag off nothing makes a new zine page (the New page control
   * is a plain lined-page button, ⌥⇧N does nothing, page settings show no Kind row) and
   * the panel's peek at the media pool is hidden. A zine page already in the notebook
   * still opens, edits and exports as ever, with the pool beside it.
   */
  zinePages: boolean;
  /**
   * The tabs, an experiment: section dividers as index tabs on the page's edges, all
   * visible at once, with a section limit from the page's height; the divider leaves
   * are paper. Off, or the experiment's commit reverted, restores the coloured slabs.
   */
  tabs: boolean;
}

const ZINE_STORAGE_KEY = "typestill.features.zine";
const TABS_STORAGE_KEY = "typestill.features.tabs";

/** The local-storage override of a flag, if the key holds "on" or "off". */
function readOverride(key: string): boolean | null {
  try {
    const value = localStorage.getItem(key);
    return value === "on" ? true : value === "off" ? false : null;
  } catch {
    return null;
  }
}

/** A flag's value: the local-storage override, else the build's variable. */
function readFlag(key: string, variable: string | undefined): boolean {
  return readOverride(key) ?? variable !== "off";
}

export const features: Features = {
  zinePages: readFlag(ZINE_STORAGE_KEY, import.meta.env.VITE_FEATURE_ZINE as string | undefined),
  tabs: readFlag(TABS_STORAGE_KEY, undefined),
};
