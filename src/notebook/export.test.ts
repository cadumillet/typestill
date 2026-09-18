import { describe, expect, it } from "vitest";
import { exportFileName } from "./exportName";

describe("export file names", () => {
  it("names files after the notebook", () => {
    const notebook = { name: "Field notes" };
    expect(exportFileName(notebook, { kind: "pdf", at: new Date("2026-09-18T12:00:00Z") })).toBe(
      "field-notes-2026-09-18.pdf",
    );
    expect(exportFileName(notebook, { kind: "page", number: 3 })).toBe("field-notes-p3.png");
    expect(exportFileName(notebook, { kind: "canvas" })).toBe("field-notes-canvas.png");
    expect(exportFileName({ name: "!!!" }, { kind: "canvas" })).toBe("notebook-canvas.png");
  });
});
