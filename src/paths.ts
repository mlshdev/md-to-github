import { dirname, extname, isAbsolute, relative, resolve } from "node:path";

export function isPathInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

export function resolveDocumentPath(contentRoot: string, requestedPath: string): string | null {
  if (!requestedPath || requestedPath.includes("\0")) return null;

  const resolvedRoot = resolve(contentRoot);
  const resolvedDocument = resolve(resolvedRoot, requestedPath);
  const extension = extname(resolvedDocument).toLowerCase();

  if (!isPathInside(resolvedRoot, resolvedDocument)) return null;
  if (extension !== ".md" && extension !== ".markdown") return null;

  return resolvedDocument;
}

export function resolveAssetPath(
  contentRoot: string,
  documentPath: string,
  requestedPath: string,
): string | null {
  if (requestedPath.includes("\0")) return null;

  const resolvedRoot = resolve(contentRoot);
  const resolvedAsset = resolve(dirname(documentPath), requestedPath);
  return isPathInside(resolvedRoot, resolvedAsset) ? resolvedAsset : null;
}
