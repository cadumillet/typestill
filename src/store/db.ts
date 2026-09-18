import Dexie, { type EntityTable, type Table } from "dexie";
import { DEFAULT_COVER } from "../notebook/cover";
import { columnFromText } from "../page/document";
import type { Canvas, Notebook, NotebookFile, Page } from "./model";

export class TypestillDb extends Dexie {
  notebooks!: EntityTable<Notebook, "id">;
  pages!: EntityTable<Page, "id">;
  canvases!: EntityTable<Canvas, "notebookId">;
  files!: Table<NotebookFile, [string, string]>;

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
  }
}

let shared: TypestillDb | undefined;

/** The app's database. Tests construct their own TypestillDb instead. */
export function getDb(): TypestillDb {
  shared ??= new TypestillDb();
  return shared;
}
