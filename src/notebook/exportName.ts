// Export file names, kept apart from the export module so tests need no browser.

import type { Notebook } from "../store/model";

/** "field-notes-2026-09-18.pdf". */
export function exportFileName(
  notebook: Pick<Notebook, "name">,
  what: { kind: "pdf"; at?: Date },
): string {
  const slug =
    notebook.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "notebook";
  switch (what.kind) {
    case "pdf":
      return `${slug}-${(what.at ?? new Date()).toISOString().slice(0, 10)}.pdf`;
  }
}
