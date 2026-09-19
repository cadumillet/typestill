import { describe, expect, it } from "vitest";
import { columnFromText } from "../page/document";
import { element, linedPage, section } from "../store/fixtures";
import { SHEET } from "../store/model";
import {
  DEFAULT_SECTION_NAME,
  SECTION_COLORS,
  addSectionAtEnd,
  appendSheet,
  cut,
  lastSectionCanGive,
  nextSectionColor,
  padToSheet,
  removeCut,
  removeSheet,
  sectionIndexOf,
  sectionOf,
  sectionRange,
  sectionsFromTags,
  sheetCount,
  sizeFor,
  slotsFromSections,
  validateSections,
  type LegacyPage,
  type LegacySection,
} from "./sections";

/** Cuts at 0, 8 and 20. */
const cuts = [section("a"), section("b", { start: 8 }), section("c", { start: 20 })];

describe("sections", () => {
  it("hands out palette colours, least used first", () => {
    expect(nextSectionColor([])).toBe(SECTION_COLORS[0].value);
    expect(nextSectionColor([section("a", { color: SECTION_COLORS[0].value })])).toBe(
      SECTION_COLORS[1].value,
    );
    const all = SECTION_COLORS.map((color, i) => section(String(i), { color: color.value }));
    expect(nextSectionColor(all)).toBe(SECTION_COLORS[0].value);
    expect(nextSectionColor([...all, section("x", { color: SECTION_COLORS[0].value })])).toBe(
      SECTION_COLORS[1].value,
    );
  });

  it("finds the section a position is in: the last cut at or below it", () => {
    expect([0, 7, 8, 19, 20, 63].map((position) => sectionIndexOf(cuts, position))).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
    expect(sectionOf(cuts, 12).id).toBe("b");
    expect(sectionOf(cuts, 0).id).toBe("a");
    // Nothing lies before the first cut, but a stray position still has a section.
    expect(sectionIndexOf(cuts, -1)).toBe(0);
    expect(sectionIndexOf([section("only")], 50)).toBe(0);
  });

  it("gives each section's range, the last one running to the size", () => {
    expect(sectionRange(cuts, 64, 0)).toEqual({ start: 0, end: 8 });
    expect(sectionRange(cuts, 64, 1)).toEqual({ start: 8, end: 20 });
    expect(sectionRange(cuts, 64, 2)).toEqual({ start: 20, end: 64 });
  });

  it("validates the cuts against the size, naming the rule broken", () => {
    expect(() => validateSections(cuts, 64)).not.toThrow();
    expect(() => validateSections(cuts, 24)).not.toThrow();
    expect(() => validateSections(cuts, 0)).toThrow(/positive multiple of 4/);
    expect(() => validateSections(cuts, 66)).toThrow(/positive multiple of 4/);
    expect(() => validateSections([], 64)).toThrow(/at least one section/);
    expect(() => validateSections([section("a", { start: 4 })], 64)).toThrow(/start at 0/);
    expect(() => validateSections([section("a"), section("b", { start: 6 })], 64)).toThrow(
      /multiple of 4/,
    );
    expect(() =>
      validateSections([section("a"), section("b", { start: 8 }), section("c", { start: 8 })], 64),
    ).toThrow(/strictly increasing/);
    expect(() =>
      validateSections([section("a"), section("b", { start: 8 }), section("c", { start: 4 })], 64),
    ).toThrow(/strictly increasing/);
    expect(() => validateSections(cuts, 20)).toThrow(/past the end/);
  });

  it("cuts a new section at a sheet boundary, keeping start order", () => {
    const next = cut(cuts, 12, "New", "#111");
    expect(next.map((s) => s.start)).toEqual([0, 8, 12, 20]);
    const made = next[2];
    expect(made).toEqual({ id: made.id, name: "New", color: "#111", start: 12, lastPageId: null });
    expect(made.id).not.toBe("");
    expect(cut(cuts, 40, "End", "#222").map((s) => s.start)).toEqual([0, 8, 20, 40]);
    // The input is left alone.
    expect(cuts.map((s) => s.start)).toEqual([0, 8, 20]);
    expect(() => cut(cuts, 0, "x", "#111")).toThrow(/first section/);
    expect(() => cut(cuts, 10, "x", "#111")).toThrow(/multiple of 4/);
    expect(() => cut(cuts, 8, "x", "#111")).toThrow(/already starts at 8/);
  });

  it("removes a cut, its pages falling to the section before", () => {
    const next = removeCut(cuts, 1);
    expect(next.map((s) => s.id)).toEqual(["a", "c"]);
    expect(sectionRange(next, 64, 0)).toEqual({ start: 0, end: 20 });
    expect(removeCut(cuts, 2).map((s) => s.id)).toEqual(["a", "b"]);
    expect(cuts).toHaveLength(3);
    expect(() => removeCut(cuts, 0)).toThrow(/first section/);
    expect(() => removeCut(cuts, 3)).toThrow(/No section/);
  });

  it("counts a section's sheets, the last section's to the size", () => {
    expect([0, 1, 2].map((i) => sheetCount(cuts, 64, i))).toEqual([2, 3, 11]);
    expect(sheetCount(cuts, 24, 2)).toBe(1);
    expect(lastSectionCanGive(cuts, 64)).toBe(true);
    expect(lastSectionCanGive(cuts, 24)).toBe(false);
    expect(lastSectionCanGive([section("only")], 4)).toBe(false);
  });

  it("appends a sheet to a section, the cuts after it moving on and the last section giving it", () => {
    expect(appendSheet(cuts, 64, 0).map((s) => s.start)).toEqual([0, 12, 24]);
    expect(appendSheet(cuts, 64, 1).map((s) => s.start)).toEqual([0, 8, 24]);
    const next = appendSheet(cuts, 64, 1);
    expect(sheetCount(next, 64, 1)).toBe(4);
    expect(sheetCount(next, 64, 2)).toBe(10);
    expect(next[2]).toEqual({ ...cuts[2], start: 24 });
    // Page numbers do not move: the input is left alone and only starts change.
    expect(cuts.map((s) => s.start)).toEqual([0, 8, 20]);
    expect(() => appendSheet(cuts, 64, 2)).toThrow(/last section/);
    expect(() => appendSheet(cuts, 64, 3)).toThrow(/No section/);
    // With the last section down to one sheet, no section can grow.
    expect(() => appendSheet(cuts, 24, 0)).toThrow(/one sheet/);
    expect(() => appendSheet(cuts, 24, 1)).toThrow(/one sheet/);
    expect(() => appendSheet([section("only")], 64, 0)).toThrow(/last section/);
    // The result is valid for the size it was made for.
    expect(() => validateSections(appendSheet(cuts, 28, 1), 28)).not.toThrow();
  });

  it("takes a sheet off a section, the cuts after it moving back and the last section taking it", () => {
    expect(removeSheet(cuts, 64, 0).map((s) => s.start)).toEqual([0, 4, 16]);
    expect(removeSheet(cuts, 64, 1).map((s) => s.start)).toEqual([0, 8, 16]);
    expect(sheetCount(removeSheet(cuts, 64, 1), 64, 2)).toBe(12);
    expect(cuts.map((s) => s.start)).toEqual([0, 8, 20]);
    expect(() => removeSheet(cuts, 64, 2)).toThrow(/last section/);
    expect(() => removeSheet(cuts, 64, 3)).toThrow(/No section/);
    const thin = [section("a"), section("b", { start: 4 }), section("c", { start: 8 })];
    expect(() => removeSheet(thin, 64, 0)).toThrow(/at least one sheet/);
    expect(() => removeSheet(thin, 64, 1)).toThrow(/at least one sheet/);
  });

  it("adds a section at the end out of the last section's last sheet", () => {
    const next = addSectionAtEnd(cuts, 64, "Section", "#111");
    expect(next.map((s) => s.start)).toEqual([0, 8, 20, 60]);
    expect(next[3]).toEqual({
      id: next[3].id,
      name: "Section",
      color: "#111",
      start: 60,
      lastPageId: null,
    });
    expect(sheetCount(next, 64, 2)).toBe(10);
    expect(sheetCount(next, 64, 3)).toBe(1);
    expect(cuts).toHaveLength(3);
    expect(() => addSectionAtEnd(cuts, 24, "x", "#111")).toThrow(/one sheet/);
    expect(addSectionAtEnd([section("only")], 8, "x", "#111").map((s) => s.start)).toEqual([0, 4]);
    expect(() => addSectionAtEnd([section("only")], 4, "x", "#111")).toThrow(/one sheet/);
  });

  it("rounds up to whole sheets and picks the size for a page count", () => {
    expect([0, 1, 4, 5, 8].map(padToSheet)).toEqual([0, 4, 4, 8, 8]);
    expect([63, 64, 65, 96, 192, 193, 200].map(sizeFor)).toEqual([64, 64, 96, 96, 192, 196, 200]);
    expect(SHEET).toBe(4);
  });
});

describe("slots from sections", () => {
  const notebook = {
    id: "nb",
    defaults: { showPageNumber: false, margin: 25, divider: 70 },
    themeId: "ruled",
  };
  /** A lined page as version 9 held it, matching `linedPage` but for its section. */
  const legacy = (id: string, sectionId: string, createdAt: number, text = ""): LegacyPage => ({
    id,
    notebookId: "nb",
    createdAt,
    kind: "lined",
    sectionId,
    showPageNumber: true,
    margin: 20,
    columns: [columnFromText(text)],
    divider: null,
    drawing: [],
    drawingLayer: "over",
    canvasView: null,
  });
  const sections: LegacySection[] = [
    { id: "s1", name: "Notes", color: "#111", lastPageId: "p3" },
    { id: "s2", name: "Work", color: "#222", lastPageId: "gone" },
  ];

  it("pads each section's run to whole sheets, in Phase 7 order, and picks the size", () => {
    // Creation order mixes the sections; s1 has 3 pages, s2 has 6.
    const pages = [
      legacy("p1", "s1", 1, "one"),
      legacy("q1", "s2", 2),
      legacy("p2", "s1", 3),
      legacy("q2", "s2", 4, "two"),
      legacy("q3", "s2", 5),
      legacy("p3", "s1", 6),
      legacy("q4", "s2", 7),
      legacy("q5", "s2", 8),
      legacy("q6", "s2", 9),
    ];
    const result = slotsFromSections({ ...notebook, sections }, pages, 1000);
    expect(result.size).toBe(64);
    expect(result.pages).toHaveLength(64);
    expect(result.pages.map((page) => page.position)).toEqual([...Array(64).keys()]);
    expect(result.pages.slice(0, 12).map((page) => page.id.length > 2 || page.id)).toEqual([
      "p1",
      "p2",
      "p3",
      true,
      "q1",
      "q2",
      "q3",
      "q4",
      "q5",
      "q6",
      true,
      true,
    ]);
    expect(result.sections).toEqual([
      { ...sections[0], start: 0 },
      { ...sections[1], start: 4, lastPageId: null },
    ]);
    // Every page keeps what it had, less its section, and is shaded by what it holds.
    expect(result.pages[0]).toEqual(
      linedPage("p1", 0, { createdAt: 1, columns: [columnFromText("one")], fill: 0.5 }),
    );
    expect(result.pages[1]).toEqual(linedPage("p2", 1, { createdAt: 3 }));
    expect(result.pages.some((page) => "sectionId" in page)).toBe(false);
    expect(result.pages.map((page) => page.fill).slice(0, 12)).toEqual([
      0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0,
    ]);
    // The padding is blank lined pages from the defaults, made after every page and now.
    const blank = result.pages[3];
    expect(blank).toEqual({
      id: blank.id,
      notebookId: "nb",
      createdAt: 1000,
      position: 3,
      kind: "lined",
      fill: 0,
      showPageNumber: false,
      margin: 25,
      columns: [columnFromText(""), columnFromText("")],
      divider: 70,
      drawing: [],
      drawingLayer: "over",
      canvasView: null,
    });
    expect(result.pages[10].createdAt).toBe(1001);
    expect(result.pages[63].createdAt).toBe(1000 + 64 - 9 - 1);
    for (let i = 1; i < 64; i++) {
      if (result.pages[i].createdAt <= 9) continue;
      expect(result.pages[i].createdAt).toBeGreaterThan(result.pages[i - 1].createdAt);
    }
    // The tail belongs to the last section.
    expect(sectionRange(result.sections, result.size, 1)).toEqual({ start: 4, end: 64 });
  });

  it("makes the blank pages after the last page when that is later than now", () => {
    const result = slotsFromSections({ ...notebook, sections }, [legacy("p1", "s1", 5000)], 10);
    expect(result.pages.slice(1, 4).map((page) => page.createdAt)).toEqual([5001, 5002, 5003]);
  });

  it("gives an empty section one blank sheet, so it still exists", () => {
    const result = slotsFromSections(
      {
        ...notebook,
        sections: [...sections, { id: "s3", name: "Later", color: "#333", lastPageId: null }],
      },
      [legacy("q1", "s2", 1, "x")],
      100,
    );
    expect(result.sections.map((s) => s.start)).toEqual([0, 4, 8]);
    expect(result.pages[4].id).toBe("q1");
    expect(result.pages.slice(0, 4).every((page) => page.fill === 0)).toBe(true);
    expect(result.size).toBe(64);
  });

  it("shades a page by the store's notion of blank: writing, images or a drawing", () => {
    const drawn: LegacyPage = { ...legacy("d", "s1", 1), drawing: [element("e")] };
    const erased: LegacyPage = {
      ...legacy("e", "s1", 2),
      drawing: [element("e", { isDeleted: true })],
    };
    const zine: LegacyPage = {
      ...legacy("z", "s1", 3),
      kind: "zine",
      columns: [],
      zine: {
        padding: 0,
        rows: [{ blocks: [{ kind: "image", image: { fileId: "f", fit: "cover" } }] }],
      },
    };
    const emptyZine: LegacyPage = {
      ...legacy("y", "s1", 4),
      kind: "zine",
      columns: [],
      zine: { padding: 0, rows: [] },
    };
    const result = slotsFromSections({ ...notebook, sections }, [drawn, erased, zine, emptyZine]);
    expect(result.pages.slice(0, 4).map((page) => page.fill)).toEqual([0.5, 0, 0.5, 0]);
  });

  it("keeps a page naming an unknown section at the end of the last one", () => {
    const result = slotsFromSections(
      { ...notebook, sections },
      [legacy("lost", "s9", 1, "x"), legacy("q1", "s2", 2), legacy("p1", "s1", 3)],
      100,
    );
    expect(result.pages.slice(0, 8).map((page) => page.id.length > 4 || page.id)).toEqual([
      "p1",
      true,
      true,
      true,
      "q1",
      "lost",
      true,
      true,
    ]);
    expect(result.pages).toHaveLength(64);
  });

  it("grows past the largest size by whole sheets", () => {
    const pages = Array.from({ length: 193 }, (_, i) => legacy(`p${i}`, "s1", i + 1));
    const result = slotsFromSections({ ...notebook, sections: [sections[0]] }, pages, 1000);
    expect(result.size).toBe(196);
    expect(result.pages).toHaveLength(196);
  });
});

describe("sections from tags", () => {
  it("turns tags into sections: Notes in the cover colour first, then the tags as they were", () => {
    const tags = [
      { id: "t1", name: "Ideas", color: "#b8342c" },
      { id: "t2", name: "Quotes", color: "#2f5b9e" },
    ];
    const { sections, sectionIdOf } = sectionsFromTags({ cover: { color: "#2e7d4f" }, tags });
    expect(sections).toHaveLength(3);
    const [notes, ideas, quotes] = sections;
    expect(notes.id).not.toBe("");
    expect(notes).toEqual({
      id: notes.id,
      name: DEFAULT_SECTION_NAME,
      color: "#2e7d4f",
      lastPageId: null,
    });
    expect(ideas).toEqual({ id: "t1", name: "Ideas", color: "#b8342c", lastPageId: null });
    expect(quotes).toEqual({ id: "t2", name: "Quotes", color: "#2f5b9e", lastPageId: null });
    expect(sectionIdOf({ tagId: null })).toBe(notes.id);
    expect(sectionIdOf({})).toBe(notes.id);
    expect(sectionIdOf({ tagId: "t2" })).toBe("t2");
    expect(sectionIdOf({ tagId: "gone" })).toBe(notes.id);
  });

  it("makes only Notes for a notebook without tags, with a fresh id each time", () => {
    const one = sectionsFromTags({ cover: { color: "#111" }, tags: [] });
    const two = sectionsFromTags({ cover: { color: "#111" }, tags: [] });
    expect(one.sections.map((s) => s.name)).toEqual([DEFAULT_SECTION_NAME]);
    expect(one.sections[0].color).toBe("#111");
    expect(one.sections[0].id).not.toBe(two.sections[0].id);
  });
});
