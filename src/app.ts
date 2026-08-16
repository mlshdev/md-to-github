import DOMPurify from "dompurify";
import hljs from "highlight.js";
import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import markdownItTaskLists from "markdown-it-task-lists";
import mermaid from "mermaid";
import { parseExcalidrawScene, renderExcalidrawScene } from "./excalidraw.ts";
import "github-markdown-css/github-markdown.css";
import "highlight.js/styles/github.css";
import "./styles.css";

interface MountedDocument {
  modifiedAt: string;
  name: string;
  path: string;
  size: number;
}

interface MarkdownDocument {
  content: string;
  modifiedAt: string;
  name: string;
  path: string;
}

interface ErrorResponse {
  error: string;
}

interface DocumentsResponse {
  documents: MountedDocument[];
}

interface MountedSource extends MountedDocument {
  id: string;
  kind: "mounted";
}

interface LocalSource {
  file: File;
  id: string;
  kind: "local";
  name: string;
  size: number;
}

type DocumentSource = LocalSource | MountedSource;

interface RenderEnvironment {
  assetUrl(value: string): string;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Application shell is missing ${selector}`);
  return element;
}

const article = requiredElement<HTMLElement>("#document");
const errorPanel = requiredElement<HTMLElement>("#error");
const emptyPanel = requiredElement<HTMLElement>("#empty");
const fileName = requiredElement<HTMLElement>("#file-name");
const fileMeta = requiredElement<HTMLElement>("#file-meta");
const fileInput = requiredElement<HTMLInputElement>("#file-input");
const mountedList = requiredElement<HTMLElement>("#mounted-list");
const mountedEmpty = requiredElement<HTMLElement>("#mounted-empty");
const mountedCount = requiredElement<HTMLElement>("#mounted-count");
const localList = requiredElement<HTMLElement>("#local-list");
const localSection = requiredElement<HTMLElement>("#local-section");
const dropOverlay = requiredElement<HTMLElement>("#drop-overlay");
const reloadButton = requiredElement<HTMLButtonElement>("#reload");
const scanButton = requiredElement<HTMLButtonElement>("#scan");
const selectButtons = document.querySelectorAll<HTMLButtonElement>("[data-select-files]");

let mountedSources: MountedSource[] = [];
let localSources: LocalSource[] = [];
let selectedSource: DocumentSource | null = null;
let selectionVersion = 0;
let dragDepth = 0;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isRelativeUrl(value: string): boolean {
  return !value.startsWith("#") && !value.startsWith("/") && !/^[a-z][a-z\d+.-]*:/i.test(value);
}

function decodeUrl(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function mountedAssetUrl(documentPath: string, value: string): string {
  if (!isRelativeUrl(value)) return value;
  return `/assets?document=${encodeURIComponent(documentPath)}&path=${encodeURIComponent(decodeUrl(value))}`;
}

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
  highlight(code, language) {
    if (language.toLowerCase() === "mermaid") {
      return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
    }

    if (language.toLowerCase() === "excalidraw") {
      return `<pre class="excalidraw">${escapeHtml(code)}</pre>`;
    }

    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }

    return "";
  },
})
  .use(markdownItAnchor, { permalink: markdownItAnchor.permalink.headerLink() })
  .use(markdownItTaskLists, { enabled: false, label: true, labelAfter: true });

const defaultImageRule = markdown.renderer.rules.image;
markdown.renderer.rules.image = (tokens, index, options, environment, renderer) => {
  const source = tokens[index]?.attrGet("src");
  if (source) {
    tokens[index]?.attrSet("src", (environment as RenderEnvironment).assetUrl(source));
  }
  return defaultImageRule?.(tokens, index, options, environment, renderer) ?? renderer.renderToken(tokens, index, options);
};

const defaultLinkRule = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
  const href = tokens[index]?.attrGet("href");
  if (href) {
    tokens[index]?.attrSet("href", (environment as RenderEnvironment).assetUrl(href));
    if (/^https?:/i.test(href)) {
      tokens[index]?.attrSet("rel", "noreferrer noopener");
      tokens[index]?.attrSet("target", "_blank");
    }
  }
  return defaultLinkRule?.(tokens, index, options, environment, renderer) ?? renderer.renderToken(tokens, index, options);
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function sourceButton(source: DocumentSource): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "document-link";
  button.type = "button";
  button.dataset.active = String(source.id === selectedSource?.id);
  button.addEventListener("click", () => void selectSource(source));

  const name = document.createElement("span");
  name.className = "document-name";
  name.textContent = source.kind === "mounted" ? source.path : source.name;

  const size = document.createElement("span");
  size.className = "document-size";
  size.textContent = formatBytes(source.size);

  button.append(name, size);
  return button;
}

function renderLibrary(): void {
  mountedList.replaceChildren(...mountedSources.map(sourceButton));
  mountedCount.textContent = String(mountedSources.length);
  mountedEmpty.hidden = mountedSources.length > 0;

  localList.replaceChildren(...localSources.map(sourceButton));
  localSection.hidden = localSources.length === 0;
}

function showEmpty(): void {
  selectedSource = null;
  article.hidden = true;
  errorPanel.hidden = true;
  emptyPanel.hidden = false;
  fileName.textContent = "No document selected";
  fileMeta.textContent = "Select or drop a Markdown file";
  reloadButton.disabled = true;
  renderLibrary();
}

function showError(message: string): void {
  article.hidden = true;
  emptyPanel.hidden = true;
  errorPanel.textContent = message;
  errorPanel.hidden = false;
}

// Scene JSON is rendered into DOM nodes after DOMPurify has run, so the SVG the
// renderer builds is never fed back through the HTML sanitizer.
function renderExcalidrawBlocks(): void {
  for (const block of article.querySelectorAll<HTMLElement>("pre.excalidraw")) {
    const figure = document.createElement("figure");
    figure.className = "excalidraw-figure";

    try {
      figure.append(renderExcalidrawScene(parseExcalidrawScene(block.textContent ?? "")));
    } catch (error) {
      figure.classList.add("excalidraw-invalid");
      figure.textContent = `Excalidraw diagram could not be rendered: ${
        error instanceof Error ? error.message : "unknown error"
      }`;
    }

    block.replaceWith(figure);
  }
}

async function renderDocument(content: string, source: DocumentSource): Promise<void> {
  const assetUrl =
    source.kind === "mounted"
      ? (value: string) => mountedAssetUrl(source.path, value)
      : (value: string) => value;

  article.innerHTML = DOMPurify.sanitize(markdown.render(content, { assetUrl }), {
    USE_PROFILES: { html: true },
  });
  emptyPanel.hidden = true;
  errorPanel.hidden = true;
  article.hidden = false;

  renderExcalidrawBlocks();

  const diagrams = article.querySelectorAll<HTMLElement>(".mermaid");
  if (diagrams.length === 0) return;

  mermaid.initialize({
    securityLevel: "strict",
    startOnLoad: false,
    theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "neutral",
  });
  await mermaid.run({ nodes: diagrams, suppressErrors: false });
}

async function selectSource(source: DocumentSource): Promise<void> {
  const currentSelection = ++selectionVersion;
  selectedSource = source;
  renderLibrary();
  reloadButton.disabled = true;
  reloadButton.textContent = "Loading...";
  errorPanel.hidden = true;

  try {
    let content: string;
    let modifiedAt: Date;

    if (source.kind === "local") {
      content = await source.file.text();
      modifiedAt = new Date(source.file.lastModified);
    } else {
      const request = await fetch(`/api/markdown?path=${encodeURIComponent(source.path)}`, {
        cache: "no-store",
      });
      const payload = (await request.json()) as MarkdownDocument | ErrorResponse;
      if (!request.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : `Request failed (${request.status})`);
      }
      content = payload.content;
      modifiedAt = new Date(payload.modifiedAt);
    }

    if (currentSelection !== selectionVersion) return;
    document.title = `${source.name} - Markdown preview`;
    fileName.textContent = source.kind === "mounted" ? source.path : source.name;
    fileMeta.textContent = `${source.kind === "mounted" ? "Mounted" : "Local"} / ${formatBytes(source.size)} / Updated ${formatDate(modifiedAt)}`;
    await renderDocument(content, source);
  } catch (error) {
    if (currentSelection === selectionVersion) {
      showError(error instanceof Error ? error.message : "Unable to render document");
    }
  } finally {
    if (currentSelection === selectionVersion) {
      reloadButton.disabled = false;
      reloadButton.textContent = "Reload";
    }
  }
}

async function scanMountedDocuments(selectInitial = false): Promise<void> {
  scanButton.disabled = true;
  try {
    const request = await fetch("/api/documents", { cache: "no-store" });
    const payload = (await request.json()) as DocumentsResponse | ErrorResponse;
    if (!request.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : `Request failed (${request.status})`);
    }

    mountedSources = payload.documents.map((document) => ({
      ...document,
      id: `mounted:${document.path}`,
      kind: "mounted",
    }));
    renderLibrary();

    if (selectedSource?.kind === "mounted") {
      const selectedPath = selectedSource.path;
      const replacement = mountedSources.find((source) => source.path === selectedPath);
      if (replacement) await selectSource(replacement);
      else if (mountedSources[0]) await selectSource(mountedSources[0]);
      else showEmpty();
    } else if (selectInitial && mountedSources[0]) {
      await selectSource(mountedSources[0]);
    } else if (selectInitial && !selectedSource) {
      showEmpty();
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unable to scan mounted documents");
  } finally {
    scanButton.disabled = false;
  }
}

function addLocalFiles(files: FileList | File[]): void {
  const markdownFiles = Array.from(files).filter((file) => /\.md(?:own)?$/i.test(file.name));
  if (markdownFiles.length === 0) {
    showError("No .md or .markdown files were selected");
    return;
  }

  const added = markdownFiles.map<LocalSource>((file) => ({
    file,
    id: `local:${crypto.randomUUID()}`,
    kind: "local",
    name: file.name,
    size: file.size,
  }));
  localSources = [...localSources, ...added];
  renderLibrary();
  void selectSource(added[0]!);
}

for (const button of selectButtons) {
  button.addEventListener("click", () => fileInput.click());
}

fileInput.addEventListener("change", () => {
  if (fileInput.files) addLocalFiles(fileInput.files);
  fileInput.value = "";
});

reloadButton.addEventListener("click", () => {
  if (selectedSource) void selectSource(selectedSource);
});

scanButton.addEventListener("click", () => void scanMountedDocuments());

window.addEventListener("dragenter", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  dragDepth += 1;
  dropOverlay.hidden = false;
});

window.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
});

window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  if (event.dataTransfer?.files) addLocalFiles(event.dataTransfer.files);
});

void scanMountedDocuments(true);
