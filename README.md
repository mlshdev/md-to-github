# Markdown Mermaid Renderer

A local Markdown workspace with GitHub-style formatting, syntax highlighting, task lists, tables, and Mermaid and Excalidraw diagrams. Select or drag files from your Mac directly into the browser, mount a directory of documents into the container, or use both workflows together. The image runs natively on Apple Silicon through Docker Desktop or OrbStack's `linux/arm64` support.

## Quick start

Build and open the included mounted document library:

```sh
docker compose up --build -d
open http://localhost:3000
```

Stop it with:

```sh
docker compose down
```

The browser lists every `.md` and `.markdown` file under the mounted directory. Use **Select .md files** or drag files anywhere on the page to add browser-local documents alongside the mounted files.

Browser-local files are read with the browser File API and are not uploaded to or persisted by the container.

## Mount your documents

Mount the directory containing your Markdown documents at `/data`:

```sh
docker build -t markdown-mermaid-renderer .
docker run --rm \
  --name markdown-preview \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --read-only \
  -p 3000:3000 \
  -v "/absolute/path/to/your/docs:/data:ro" \
  markdown-mermaid-renderer
```

Open <http://localhost:3000>. The mount is scanned recursively. Select **Rescan** after adding or removing mounted files. Relative images and links are resolved from each mounted Markdown file's directory. Parent references such as `../shared/image.png` work as long as they remain inside `/data`.

The mount is optional. Without one, the website still supports selecting and dropping local Markdown files:

```sh
docker run --rm \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --read-only \
  -p 3000:3000 \
  markdown-mermaid-renderer
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `CONTENT_ROOT` | `/data` | Root directory from which assets may be served |
| `PORT` | `3000` | Container HTTP port |

Mounted Markdown source is read again whenever **Reload** is selected, so the image does not need to be rebuilt after editing a file.

## Diagrams

A fenced `mermaid` block renders through Mermaid. A fenced `excalidraw` block holds an Excalidraw scene — the JSON that `excalidraw.com` and the Excalidraw file format use — and renders in place as a static SVG:

````markdown
```excalidraw
{
  "type": "excalidraw",
  "version": 2,
  "elements": [ ... ],
  "appState": { "viewBackgroundColor": "#ffffff" }
}
```
````

`example/excalidraw.md` is a working scene to compare against. Rectangles, diamonds, ellipses, lines, arrows, freedraw strokes, text, frames, and embedded images are drawn; rotation, opacity, dash and dot strokes, hachure and cross-hatch fills, corner rounding, and arrowheads are honoured. Diagrams are read-only — there is no editor — and a block that is not a readable scene is replaced by a message naming the problem rather than disappearing.

Two deliberate limits: Excalidraw's own fonts are not bundled, so hand-drawn text falls back to the closest handwriting family the host has, and only `data:` image payloads embedded in the scene are drawn — a scene referencing a remote image would otherwise turn opening a document into a network request. Scenes above 5000 elements are rejected instead of locking up the page.

## Published images

Images are published to GitHub Container Registry for `linux/arm64` only:

```sh
docker pull ghcr.io/<owner>/<repo>:latest
```

Every successful build on `main` publishes four tags for the same digest:

| Tag | Example | Mutability |
| --- | --- | --- |
| `latest` | `latest` | Moves to the newest `main` build |
| `<package version>` | `1.0.0` | Moves to the newest build of that `package.json` version |
| `<package version>-<date>.<run>` | `1.0.0-20260816.42` | Immutable |
| `sha-<commit>` | `sha-a1b2c3…` | Immutable |

`package.json` `version` is the release identity; the date and run number make each build individually addressable even when several builds share a version. Deployments should pin a build or commit tag — `latest` is a pointer, not a release.

### Run the published image

No local build needed — pull and run the image from GHCR directly:

```sh
docker pull ghcr.io/<owner>/<repo>:latest
docker run --rm \
  --name markdown-preview \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --read-only \
  -p 3000:3000 \
  -v "/absolute/path/to/your/docs:/data:ro" \
  ghcr.io/<owner>/<repo>:latest
```

Open <http://localhost:3000>. Drop the `-v` mount to run without mounted documents; the browser's **Select .md files** and drag-and-drop still work.

Or with Docker Compose:

```yaml
services:
  markdown-preview:
    image: ghcr.io/<owner>/<repo>:latest
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    read_only: true
    ports:
      - "3000:3000"
    volumes:
      - "/absolute/path/to/your/docs:/data:ro"
```

```sh
docker compose up -d
```

Replace `<owner>/<repo>` with this repository's GitHub path. `latest` always points at the newest `main` build; pin a `<package version>`, `<package version>-<date>.<run>`, or `sha-<commit>` tag instead for a reproducible deployment — see the tag table above.

## Automated rebuilds

Three workflows keep the published image current. Both scanners commit to `main` and then call the build workflow directly, because a push made with `GITHUB_TOKEN` does not start a new workflow run.

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `build.yml` | push to `main`, pull request, dispatch, or called by a scanner | Typechecks, tests, builds the image, smoke tests the running container, then pushes on non-PR runs |
| `base-image-update.yml` | daily 04:17 UTC, or dispatch | Resolves every external `FROM` against its registry, re-pins tag and digest, rebuilds |
| `dependency-update.yml` | daily 04:47 UTC, or dispatch | Runs `bun update --latest`, verifies, rebuilds |

Both scanners validate before committing — the image is built and has to answer `/healthz` — so an unattended update cannot leave `main` broken or publish an image that will not boot. Run either with the `dry-run` input to see what is available without committing.

Base images are pinned as `<image>:<tag>@sha256:<digest>`. The comment above each `FROM` bounds how far the tag may move:

```dockerfile
# update-policy: minor
FROM docker.io/oven/bun:1.3.14@sha256:e10577f0… AS runtime
```

`major` (the default) takes the newest release, `minor` stays inside the current major, `patch` inside the current minor, and `digest` keeps the tag and only re-pins the digest. Only tags sharing the current tag's variant suffix are considered, so a `-slim` pin never jumps to a `-alpine` image. `bun.lock` and the CI toolchain follow the same pin: the workflows read the Bun version out of the Dockerfile.

`main` must accept pushes from `github-actions[bot]`. If branch protection requires pull requests there, the scanners' commit step will fail.

## Local development

```sh
bun install
bun run build
bun run check
bun test
CONTENT_ROOT="$PWD/example" bun run dist/server.js
```

Raw HTML in Markdown is disabled. Rendered HTML is sanitized with DOMPurify, Mermaid uses `securityLevel: strict`, symlinks are not indexed, files outside `CONTENT_ROOT` are not served, and the Compose service drops all Linux capabilities.
