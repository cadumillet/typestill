import { describe, expect, it } from "vitest";
import { formatStamp } from "./PageMarks";

describe("date stamp", () => {
  it("writes the month in full, then the day and the year", () => {
    const stamp = formatStamp(new Date(2026, 8, 16));
    expect(stamp).toMatch(/September/);
    expect(stamp).toMatch(/16/);
    expect(stamp).toMatch(/2026/);
  });
});
