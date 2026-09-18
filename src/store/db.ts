import Dexie, { type EntityTable, type Table } from "dexie";
import { DEFAULT_COVER } from "../notebook/cover";
import { columnFromText } from "../page/document";
import { convertLegacyZine, isLegacyZine } from "../page/zineLegacy";
import { DEFAULT_THEME_ID } from "../theme/themes";
import type { Canvas, Notebook, NotebookFile, Page, Thumbnail } from "./model";

export class TypestillDb extends Dexie {
  notebooks!: EntityTable<Notebook, "id">;
  pages!: EntityTable<Page, "id">;
  canvases!: EntityTable<Canvas, "notebookId">;
  files!: Table<NotebookFile, [string, string]>;
  thumbnails!: EntityTable<Thumbnail, "pageId">;

  constructor(name = "typestill") {
    super(name);
    const stores = {
      notebooks: "id, lastOpenedAt",
      pages: "id, notebookId, [notebookId+createdAt]",
      canvases: "notebookId",
      files: "[notebookId+id], notebookId",
    };
    this.version(1).stores(stores);
    // Version 2: columns went from plain strings to { text, doc }. Each line break of a
    // plain-text column becomes a paragraph boundary, which is what Enter meant then.
    this.version(2)
      .stores(stores)
      .upgrade((tx) =>
        tx
          .table("pages")
          .toCollection()
          .modify((page: { columns: unknown[] }) => {
            page.columns = page.columns.map((column) =>
              typeof column === "string" ? columnFromText(column) : column,
            );
          }),
      );
    // Version 3: notebooks got a cover. Existing ones get the default.
    this.version(3)
      .stores(stores)
      .upgrade((tx) =>
        tx
          .table("notebooks")
          .toCollection()
          .modify((notebook: { cover?: unknown }) => {
            notebook.cover ??= { ...DEFAULT_COVER };
          }),
      );
    // Version 4: pages got a kind. Every existing page is lined.
    this.version(4)
      .stores(stores)
      .upgrade((tx) =>
        tx
          .table("pages")
          .toCollection()
          .modify((page: { kind?: unknown }) => {
            page.kind ??= "lined";
          }),
      );
    // Version 5: notebooks reference a theme. Existing ones keep today's look, Ruled.
    this.version(5)
      .stores(stores)
      .upgrade((tx) =>
        tx
          .table("notebooks")
          .toCollection()
          .modify((notebook: { themeId?: unknown }) => {
            notebook.themeId ??= DEFAULT_THEME_ID;
          }),
      );
    // Version 6: page thumbnails, a cache outside the backup. No data to convert.
    this.version(6).stores({ ...stores, thumbnails: "pageId, notebookId" });
    // Version 7: zine pages are rows of blocks (converted losslessly from the old media
    // block shape), and the date stamp fields go, the page having no date stamp.
    this.version(7)
      .stores({ ...stores, thumbnails: "pageId, notebookId" })
      .upgrade(async (tx) => {
        await tx
          .table("pages")
          .toCollection()
          .modify((page: { zine?: unknown; showDate?: unknown }) => {
            if (isLegacyZine(page.zine)) page.zine = convertLegacyZine(page.zine);
            delete page.showDate;
          });
        await tx
          .table("notebooks")
          .toCollection()
          .modify((notebook: { defaults?: { showDate?: unknown } }) => {
            delete notebook.defaults?.showDate;
          });
      });
    // Version 8: documents may carry the highlight mark (backup version 7). No data changes.
    this.version(8).stores({ ...stores, thumbnails: "pageId, notebookId" });
    // Version 9: pages got clippings (backup version 8). Existing pages have none.
    this.version(9)
      .stores({ ...stores, thumbnails: "pageId, notebookId" })
      .upgrade((tx) =>
        tx
          .table("pages")
          .toCollection()
          .modify((page: { clippings?: unknown }) => {
            page.clippings ??= [];
          }),
      );
  }
}

let shared: TypestillDb | undefined;

/** The app's database. Tests construct their own TypestillDb instead. */
export function getDb(): TypestillDb {
  shared ??= new TypestillDb();
  return shared;
}
