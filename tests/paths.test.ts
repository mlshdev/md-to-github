import { describe, expect, test } from "bun:test";
import { resolveAssetPath, resolveDocumentPath } from "../src/paths.ts";

describe("resolveDocumentPath", () => {
  test("accepts documents inside the content root", () => {
    expect(resolveDocumentPath("/data", "docs/readme.md")).toBe("/data/docs/readme.md");
  });

  test("rejects documents outside the content root", () => {
    expect(resolveDocumentPath("/data", "../etc/passwd.md")).toBeNull();
  });

  test("rejects non-Markdown files", () => {
    expect(resolveDocumentPath("/data", "docs/image.png")).toBeNull();
  });
});

describe("resolveAssetPath", () => {
  test("resolves assets relative to the Markdown document", () => {
    expect(resolveAssetPath("/data", "/data/docs/readme.md", "images/chart.png")).toBe(
      "/data/docs/images/chart.png",
    );
  });

  test("allows parent paths that remain in the content root", () => {
    expect(resolveAssetPath("/data", "/data/docs/readme.md", "../shared/chart.png")).toBe(
      "/data/shared/chart.png",
    );
  });

  test("blocks traversal outside the content root", () => {
    expect(resolveAssetPath("/data", "/data/readme.md", "../etc/passwd")).toBeNull();
  });

  test("blocks null bytes", () => {
    expect(resolveAssetPath("/data", "/data/readme.md", "image\0.png")).toBeNull();
  });
});
