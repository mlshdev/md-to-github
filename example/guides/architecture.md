# Architecture

Mounted directories are scanned recursively, so documents can be organized into folders.

```mermaid
sequenceDiagram
    participant Browser
    participant Container
    participant Mount as /data mount
    Browser->>Container: GET /api/documents
    Container->>Mount: Scan .md files
    Mount-->>Container: Document metadata
    Container-->>Browser: Mounted library
```

Return to `document.md` from the mounted files list, or add local documents with the file picker and drag-and-drop zone.
