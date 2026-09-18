import { describe, expect, it } from "vitest";
import { exportFileName } from "./exportName";

describe("export file names", () => {
  it("names files after the notebook", () => {
    const notebook = { name: "Field notes" };
    expect(exportFileName(notebook, { kind: "pdf", at: new Date("2026-09-18T12:00:00Z") })).toBe(
      "field-notes-2026-09-18.pdf",
    );
    expect(
      exportFileName({ name: "!!!" }, { kind: "pdf", at: new Date("2026-09-18T12:00:00Z") }),
    ).toBe("notebook-2026-09-18.pdf");
  });
});
