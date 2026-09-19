import Dexie, { type EntityTable, type Table } from "dexie";
import { DEFAULT_COVER, type Cover } from "../notebook/cover";
import {
  sectionsFromTags,
  slotsFromSections,
  type LegacyPage,
  type LegacySection,
  type LegacyTag,
} from "../notebook/sections";
import { columnFromText, columnLeftToParagraph, type Column } from "../page/document";
import { convertLegacyZine, isLegacyZine } from "../page/zineLegacy";
import { DEFAULT_THEME_ID } from "../theme/themes";
import {
  DEFAULT_NOTEBOOK_DEFAULTS,
  type Canvas,
  type Notebook,
  type NotebookFile,
  type Page,
  type Thumbnail,
} from "./model";

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
            (notebook: {
              id: string;
              cover?: Cover;
              tags?: LegacyTag[];
              sections?: LegacySection[];
            }) => {
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
    // Version 11: a notebook of fixed size (backup version 10). The notebook gets its
    // `size` and each section its `start`; pages become slots with a `position` and a
    // `fill` in place of their `sectionId`, ordered by the new [notebookId+position]
    // index. Each notebook is converted whole by slotsFromSections: its pages keep their
    // order and section, each section is padded to whole sheets with blank pages, and the
    // slots up to the size are blank pages too. A page whose notebook is gone is left
    // alone, as in version 10.
    this.version(11)
      .stores({
        ...stores,
        pages: "id, notebookId, [notebookId+createdAt], [notebookId+position]",
        thumbnails: "pageId, notebookId",
      })
      .upgrade(async (tx) => {
        const notebooks: (Pick<Notebook, "id"> &
          Partial<Pick<Notebook, "defaults" | "themeId">> & { sections: LegacySection[] })[] =
          await tx.table("notebooks").toArray();
        for (const notebook of notebooks) {
          const pages: LegacyPage[] = await tx
            .table("pages")
            .where("notebookId")
            .equals(notebook.id)
            .toArray();
          // The blank pages are built from the defaults, filled in for a notebook that
          // predates them.
          const converted = slotsFromSections(
            {
              ...notebook,
              defaults: { ...DEFAULT_NOTEBOOK_DEFAULTS, ...notebook.defaults },
              themeId: notebook.themeId ?? DEFAULT_THEME_ID,
            },
            pages,
          );
          await tx
            .table("notebooks")
            .update(notebook.id, { size: converted.size, sections: converted.sections });
          // A put replaces each existing page whole, so its sectionId goes with it, and
          // adds the blank ones.
          await tx.table("pages").bulkPut(converted.pages);
        }
      });
    // Version 12 (backup version 11): a paragraph's align may be "paragraph", the fourth
    // alignment. The stores are the same and nothing is converted.
    this.version(12).stores({
      ...stores,
      pages: "id, notebookId, [notebookId+createdAt], [notebookId+position]",
      thumbnails: "pageId, notebookId",
    });
    // Version 13 (backup version 12): the paragraph alignment is the default. Until now
    // left was the only default, so every left-aligned paragraph, in the columns and in
    // zine text blocks, becomes paragraph-aligned; centred and right ones stay.
    this.version(13)
      .stores({
        ...stores,
        pages: "id, notebookId, [notebookId+createdAt], [notebookId+position]",
        thumbnails: "pageId, notebookId",
      })
      .upgrade((tx) =>
        tx
          .table("pages")
          .toCollection()
          .modify(
            (page: {
              columns: Column[];
              zine?: {
                rows: { blocks: ({ kind: "text"; column: Column } | { kind: string })[] }[];
              } | null;
            }) => {
              page.columns = page.columns.map(columnLeftToParagraph);
              if (page.zine) {
                for (const row of page.zine.rows) {
                  for (const block of row.blocks) {
                    if (block.kind === "text" && "column" in block) {
                      block.column = columnLeftToParagraph(block.column);
                    }
                  }
                }
              }
            },
          ),
      );
  }
}

let shared: TypestillDb | undefined;

/** The app's database. Tests construct their own TypestillDb instead. */
export function getDb(): TypestillDb {
  shared ??= new TypestillDb();
  return shared;
}
