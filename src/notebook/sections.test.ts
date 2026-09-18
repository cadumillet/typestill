import { describe, expect, it } from "vitest";
import { section } from "../store/fixtures";
import {
  DEFAULT_SECTION_NAME,
  SECTION_COLORS,
  nextSectionColor,
  pagesInOrder,
  sectionOf,
  sectionRuns,
  sectionsFromTags,
} from "./sections";

const page = (id: string, sectionId: string, createdAt: number) => ({ id, sectionId, createdAt });

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

  it("looks a page's section up", () => {
    const sections = [section("a", { color: "#111" }), section("b", { color: "#222" })];
    expect(sectionOf({ sectionId: "b" }, sections)?.color).toBe("#222");
    expect(sectionOf({ sectionId: "gone" }, sections)).toBeUndefined();
  });

  it("orders pages by section, then by creation, unknown sections last", () => {
    const sections = [section("b"), section("a")];
    const pages = [
      page("p1", "a", 1),
      page("p2", "b", 2),
      page("p3", "lost", 3),
      page("p4", "a", 4),
      page("p5", "b", 5),
      page("p6", "lost", 0),
    ];
    const ordered = pagesInOrder(sections, pages);
    expect(ordered.map((p) => p.id)).toEqual(["p2", "p5", "p1", "p4", "p6", "p3"]);
    // The input is left alone.
    expect(pages.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
  });

  it("cuts the ordered pages into one run per section, empty sections included", () => {
    const sections = [section("a"), section("empty"), section("b")];
    const ordered = [page("p1", "a", 1), page("p2", "a", 2), page("p3", "b", 3)];
    expect(sectionRuns(sections, ordered)).toEqual([
      { section: sections[0], start: 0, pages: [ordered[0], ordered[1]] },
      { section: sections[1], start: 2, pages: [] },
      { section: sections[2], start: 2, pages: [ordered[2]] },
    ]);
    expect(sectionRuns([section("a")], [])).toEqual([
      { section: section("a"), start: 0, pages: [] },
    ]);
  });

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
