import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverMarkdownDocuments } from "../src/documents.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("discoverMarkdownDocuments", () => {
  test("finds Markdown files recursively in path order", async () => {
    const root = await mkdtemp(join(tmpdir(), "markdown-renderer-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "guides"));
    await writeFile(join(root, "README.md"), "# Readme");
    await writeFile(join(root, "guides", "setup.markdown"), "# Setup");
    await writeFile(join(root, "ignored.txt"), "ignored");

    const documents = await discoverMarkdownDocuments(root);

    expect(documents.map((document) => document.path)).toEqual([
      "guides/setup.markdown",
      "README.md",
    ]);
  });

  test("does not follow symbolic links", async () => {
    const root = await mkdtemp(join(tmpdir(), "markdown-renderer-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "real.md"), "# Real");
    await symlink(join(root, "real.md"), join(root, "linked.md"));

    const documents = await discoverMarkdownDocuments(root);

    expect(documents.map((document) => document.path)).toEqual(["real.md"]);
  });
});
