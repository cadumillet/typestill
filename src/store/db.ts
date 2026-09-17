import Dexie, { type EntityTable, type Table } from "dexie";
import type { Canvas, Notebook, NotebookFile, Page } from "./model";

export class TypestillDb extends Dexie {
  notebooks!: EntityTable<Notebook, "id">;
  pages!: EntityTable<Page, "id">;
  canvases!: EntityTable<Canvas, "notebookId">;
  files!: Table<NotebookFile, [string, string]>;

  constructor(name = "typestill") {
    super(name);
    this.version(1).stores({
      notebooks: "id, lastOpenedAt",
      pages: "id, notebookId, [notebookId+createdAt]",
      canvases: "notebookId",
      files: "[notebookId+id], notebookId",
    });
  }
}

let shared: TypestillDb | undefined;

/** The app's database. Tests construct their own TypestillDb instead. */
export function getDb(): TypestillDb {
  shared ??= new TypestillDb();
  return shared;
}
