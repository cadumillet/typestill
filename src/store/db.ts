import Dexie, { type EntityTable, type Table } from "dexie";
import { DEFAULT_COVER, type Cover } from "../notebook/cover";
import { sectionsFromTags, type LegacyTag } from "../notebook/sections";
import { columnFromText } from "../page/document";
import { convertLegacyZine, isLegacyZine } from "../page/zineLegacy";
import { DEFAULT_THEME_ID } from "../theme/themes";
import type { Canvas, Notebook, NotebookFile, Page, Section, Thumbnail } from "./model";

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
    // Version 9: pages carry a drawing (backup version 8). Existing pages get an empty one,
    // painted over the text.
    this.version(9)
      .stores({ ...stores, thumbnails: "pageId, notebookId" })
      .upgrade((tx) =>
        tx
          .table("pages")
          .toCollection()
          .modify((page: { drawing?: unknown; drawingLayer?: unknown }) => {
            page.drawing ??= [];
            page.drawingLayer ??= "over";
          }),
      );
    // Version 10: tags become sections (backup version 9). Each notebook's untagged pages
    // go into a first section, Notes, in the cover's colour, then one section per tag
    // keeps the tag's id, name and colour; a page carries its section's id in place of
    // its tag's. A page whose notebook is gone has no sections to join and is left alone.
    this.version(10)
      .stores({ ...stores, thumbnails: "pageId, notebookId" })
      .upgrade(async (tx) => {
        const sectionIdOf = new Map<string, (page: { tagId?: string | null }) => string>();
        await tx
          .table("notebooks")
          .toCollection()
          .modify(
            (notebook: { id: string; cover?: Cover; tags?: LegacyTag[]; sections?: Section[] }) => {
              const converted = sectionsFromTags({
                cover: notebook.cover ?? DEFAULT_COVER,
                tags: notebook.tags ?? [],
              });
              notebook.sections = converted.sections;
              delete notebook.tags;
              sectionIdOf.set(notebook.id, converted.sectionIdOf);
            },
          );
        await tx
          .table("pages")
          .toCollection()
          .modify((page: { notebookId: string; tagId?: string | null; sectionId?: string }) => {
            const convert = sectionIdOf.get(page.notebookId);
            if (!convert) return;
            page.sectionId = convert(page);
            delete page.tagId;
          });
      });
  }
}

let shared: TypestillDb | undefined;

/** The app's database. Tests construct their own TypestillDb instead. */
export function getDb(): TypestillDb {
  shared ??= new TypestillDb();
  return shared;
}
