// Tag helpers. Tags are defined at notebook level, one per page at most; the tag's colour
// is what colours the page's square in the rail. The palette is the cover palette.

import type { Page, Tag } from "../store/model";
import { COVER_COLORS } from "./cover";

export const TAG_COLORS = COVER_COLORS;
export const NEW_TAG_VALUE = "__new__";

/** The first palette colour no tag uses yet, else the least used one. */
export function nextTagColor(tags: readonly Tag[]): string {
  const counts = new Map(TAG_COLORS.map((color) => [color.value, 0]));
  for (const tag of tags) counts.set(tag.color, (counts.get(tag.color) ?? 0) + 1);
  let best = TAG_COLORS[0].value;
  let fewest = Infinity;
  for (const color of TAG_COLORS) {
    const count = counts.get(color.value) ?? 0;
    if (count < fewest) {
      fewest = count;
      best = color.value;
    }
  }
  return best;
}

/** The tag a page carries, if it still exists. */
export function tagOf(page: Pick<Page, "tagId">, tags: readonly Tag[]): Tag | undefined {
  return page.tagId === null ? undefined : tags.find((tag) => tag.id === page.tagId);
}

/** Whether a page passes the rail's filter: no filter, or the page carries that tag. */
export function passesFilter(page: Pick<Page, "tagId">, filterTagId: string | null): boolean {
  return filterTagId === null || page.tagId === filterTagId;
}
