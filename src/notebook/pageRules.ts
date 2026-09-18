// The one-page rule: a new page cannot be added while the open page is empty. The user
// fills the page in front of them first, as in a notebook. Every entry point (the rail,
// the app bar, the shortcuts) asks here, and the session refuses here, so the rule can
// be relaxed or removed in one place.

import { isPageEmpty } from "../store/notebooks";
import type { Page } from "../store/model";

/** Whether a new page may be added after `open`, the page in front of the user. */
export function canAddPage(open: Page): boolean {
  return !isPageEmpty(open);
}

/** Why a new page cannot be added, for the tooltip of an add control that is off. */
export const ADD_PAGE_HINT = "this page is still empty";
