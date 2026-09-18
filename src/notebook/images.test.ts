import { describe, expect, it } from "vitest";
import { bytesOfDataUrl, downscaleFactor, hashBytes, imageFilesOf, isImageFile } from "./images";

describe("image import helpers", () => {
  it("scales the long edge down to the limit and never up", () => {
    expect(downscaleFactor(4096, 1000)).toBe(0.5);
    expect(downscaleFactor(1000, 4096)).toBe(0.5);
    expect(downscaleFactor(2048, 100)).toBe(1);
    expect(downscaleFactor(300, 200)).toBe(1);
    expect(downscaleFactor(600, 300, 300)).toBe(0.5);
  });

  it("hashes bytes as SHA-1 hex", async () => {
    expect(await hashBytes(new TextEncoder().encode("abc"))).toBe(
      "a9993e364706816aba3e25717850c26c9cd0d89d",
    );
  });

  it("decodes a data URL's bytes", () => {
    expect([...bytesOfDataUrl("data:text/plain;base64,YWJj")]).toEqual([97, 98, 99]);
  });

  it("keeps only decodable image files", () => {
    expect(isImageFile({ type: "image/jpeg" })).toBe(true);
    expect(isImageFile({ type: "image/png" })).toBe(true);
    expect(isImageFile({ type: "image/svg+xml" })).toBe(false);
    expect(isImageFile({ type: "text/plain" })).toBe(false);
    expect(imageFilesOf(null)).toEqual([]);
  });
});
