import { readdir, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

export interface MountedDocument {
  modifiedAt: string;
  name: string;
  path: string;
  size: number;
}

function isMarkdownFile(name: string): boolean {
  const extension = extname(name).toLowerCase();
  return extension === ".md" || extension === ".markdown";
}

export async function discoverMarkdownDocuments(contentRoot: string): Promise<MountedDocument[]> {
  const documents: MountedDocument[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;

      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile() && isMarkdownFile(entry.name)) {
        const metadata = await stat(absolutePath);
        documents.push({
          modifiedAt: metadata.mtime.toISOString(),
          name: entry.name,
          path: relative(contentRoot, absolutePath).split(sep).join("/"),
          size: metadata.size,
        });
      }
    }
  }

  try {
    await walk(contentRoot);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }

  return documents.sort((left, right) => left.path.localeCompare(right.path));
}
