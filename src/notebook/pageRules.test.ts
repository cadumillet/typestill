import { describe, expect, it } from "vitest";
import { columnFromText } from "../page/document";
import { emptyZine } from "../page/zine";
import type { Page } from "../store/model";
import { RULED } from "../theme/themes";
import { canAddPage } from "./pageRules";

const lined = (text: string): Page => ({
  id: "p1",
  notebookId: "n1",
  createdAt: 1,
  kind: "lined",
  tagId: null,
  showPageNumber: true,
  margin: 20,
  columns: [columnFromText(text)],
  divider: null,
  canvasView: null,
});

describe("canAddPage", () => {
  it("refuses while the open lined page is blank", () => {
    expect(canAddPage(lined(""))).toBe(false);
  });

  it("allows once something is written, as the store's own notion of empty has it", () => {
    expect(canAddPage(lined("a note"))).toBe(true);
    expect(canAddPage(lined("\n"))).toBe(true);
  });

  it("refuses while the open zine page has nothing on it", () => {
    const zine: Page = { ...lined(""), kind: "zine", columns: [], zine: emptyZine(RULED.zine) };
    expect(canAddPage(zine)).toBe(false);
    const withImage: Page = {
      ...zine,
      zine: {
        ...zine.zine!,
        rows: [{ blocks: [{ kind: "image", image: { fileId: "f", fit: "cover" } }] }],
      },
    };
    expect(canAddPage(withImage)).toBe(true);
  });
});
