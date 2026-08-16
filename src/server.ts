import { basename, resolve } from "node:path";
import { realpath, stat } from "node:fs/promises";
import { discoverMarkdownDocuments } from "./documents.ts";
import { isPathInside, resolveAssetPath, resolveDocumentPath } from "./paths.ts";

const contentRoot = resolve(process.env.CONTENT_ROOT ?? "/data");
const canonicalContentRoot = await realpath(contentRoot).catch(() => contentRoot);
const requestedPort = Number.parseInt(process.env.PORT ?? "3000", 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 3000;

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return new Response(body, { ...init, headers });
}

function json(data: unknown, status = 200): Response {
  return response(JSON.stringify(data), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function serveFile(path: string, headOnly: boolean, cacheControl: string): Promise<Response> {
  const file = Bun.file(path);
  if (!(await file.exists())) return response("Not found", { status: 404 });

  return response(headOnly ? null : file, {
    headers: {
      "Cache-Control": cacheControl,
      "Content-Length": String(file.size),
      "Content-Type": file.type || "application/octet-stream",
    },
  });
}

async function canonicalPath(candidate: string): Promise<string | null> {
  try {
    const resolvedPath = await realpath(candidate);
    return isPathInside(canonicalContentRoot, resolvedPath) ? resolvedPath : null;
  } catch {
    return null;
  }
}

async function documentsResponse(): Promise<Response> {
  try {
    return json({ documents: await discoverMarkdownDocuments(canonicalContentRoot) });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to scan mounted documents" }, 500);
  }
}

async function markdownResponse(requestedPath: string | null): Promise<Response> {
  const candidate = requestedPath ? resolveDocumentPath(contentRoot, requestedPath) : null;
  if (!candidate) return json({ error: "Invalid Markdown path" }, 400);

  const documentPath = await canonicalPath(candidate);
  if (!documentPath) return json({ error: "Markdown file not found" }, 404);

  try {
    const metadata = await stat(documentPath);
    if (!metadata.isFile()) return json({ error: "Markdown path is not a file" }, 404);

    return json({
      content: await Bun.file(documentPath).text(),
      modifiedAt: metadata.mtime.toISOString(),
      name: basename(documentPath),
      path: requestedPath,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return json({ error: "Markdown file not found" }, 404);
    }
    console.error(error);
    return json({ error: "Unable to read Markdown file" }, 500);
  }
}

async function assetResponse(
  documentRequest: string | null,
  assetRequest: string | null,
  headOnly: boolean,
): Promise<Response> {
  const documentCandidate = documentRequest
    ? resolveDocumentPath(contentRoot, documentRequest)
    : null;
  if (!documentCandidate || !assetRequest) return response("Invalid asset path", { status: 400 });

  const documentPath = await canonicalPath(documentCandidate);
  if (!documentPath) return response("Document not found", { status: 404 });

  const assetCandidate = resolveAssetPath(contentRoot, documentPath, assetRequest);
  if (!assetCandidate) return response("Forbidden", { status: 403 });

  const assetPath = await canonicalPath(assetCandidate);
  if (!assetPath) return response("Asset not found", { status: 404 });
  return serveFile(assetPath, headOnly, "no-cache");
}

const server = Bun.serve({
  hostname: "0.0.0.0",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const headOnly = request.method === "HEAD";

    if (request.method !== "GET" && !headOnly) {
      return response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    if (url.pathname === "/healthz") return response(headOnly ? null : "ok");
    if (url.pathname === "/favicon.ico") return response(null, { status: 204 });
    if (url.pathname === "/api/documents") return headOnly ? response(null) : documentsResponse();
    if (url.pathname === "/api/markdown") {
      return headOnly ? response(null) : markdownResponse(url.searchParams.get("path"));
    }
    if (url.pathname === "/assets") {
      return assetResponse(
        url.searchParams.get("document"),
        url.searchParams.get("path"),
        headOnly,
      );
    }
    if (url.pathname === "/") return serveFile("./dist/index.html", headOnly, "no-cache");
    if (url.pathname === "/app.js") return serveFile("./dist/app.js", headOnly, "no-cache");
    if (url.pathname === "/app.css") return serveFile("./dist/app.css", headOnly, "no-cache");

    return response("Not found", { status: 404 });
  },
});

console.log(`Markdown renderer listening on ${server.url} with content root ${contentRoot}`);
