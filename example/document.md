# Markdown + Mermaid preview

This page is rendered inside the container with **GitHub-style Markdown**.

## Mermaid diagram

```mermaid
flowchart LR
    A[Markdown file] --> B[Bun server]
    B --> C[markdown-it]
    C --> D[Mermaid]
    D --> E[GitHub-style view]
```

## Markdown features

- [x] Tables, task lists, and fenced code
- [x] Syntax highlighting
- [x] Relative images and links
- [x] Light and dark color schemes

| Component | Purpose |
| --- | --- |
| Bun | HTTP server and frontend bundler |
| Mermaid | Diagram rendering |
| DOMPurify | Output sanitization |

```ts
const message: string = "Rendered locally";
console.log(message);
```
