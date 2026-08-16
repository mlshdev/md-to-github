# Markdown Mermaid Renderer

A local Markdown workspace with GitHub-style formatting, syntax highlighting, task lists, tables, and Mermaid diagrams. Select or drag files from your Mac directly into the browser, mount a directory of documents into the container, or use both workflows together. The image runs natively on Apple Silicon through Docker Desktop or OrbStack's `linux/arm64` support.

## Quick start

Pull and run the published image — no build, no mounts required:

```sh
docker pull ghcr.io/mlshdev/md-to-github:latest
docker run --rm \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --read-only \
  -p 3000:3000 \
  ghcr.io/mlshdev/md-to-github:latest
open http://localhost:3000
```

Use **Select .md files** or drag files anywhere on the page to open documents. Browser-local files are read with the browser File API and are not uploaded to or persisted by the container.

## Mount your documents

Mount a directory of Markdown documents at `/data` to browse it without selecting each file:

```sh
docker run --rm \
  --name markdown-preview \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --read-only \
  -p 3000:3000 \
  -v "/absolute/path/to/your/docs:/data:ro" \
  ghcr.io/mlshdev/md-to-github:latest
```

Open <http://localhost:3000>. The mount is scanned recursively. Select **Rescan** after adding or removing mounted files. Relative images and links are resolved from each mounted Markdown file's directory. Parent references such as `../shared/image.png` work as long as they remain inside `/data`.

## Build from source

Build and open the included mounted document library with Docker Compose:

```sh
docker compose up --build -d
open http://localhost:3000
```

Stop it with:

```sh
docker compose down
```

Or build and run the image directly:

```sh
docker build -t markdown-mermaid-renderer .
docker run --rm \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --read-only \
  -p 3000:3000 \
  -v "/absolute/path/to/your/docs:/data:ro" \
  markdown-mermaid-renderer
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `CONTENT_ROOT` | `/data` | Root directory from which assets may be served |
| `PORT` | `3000` | Container HTTP port |

Mounted Markdown source is read again whenever **Reload** is selected, so the image does not need to be rebuilt after editing a file.

## Diagrams

A fenced `mermaid` block renders through Mermaid.

## Published images

Images are published to GitHub Container Registry for `linux/arm64` only:

```sh
docker pull ghcr.io/mlshdev/md-to-github:latest
```

Every successful build on `main` publishes four tags for the same digest:

| Tag | Example | Mutability |
| --- | --- | --- |
| `latest` | `latest` | Moves to the newest `main` build |
| `<package version>` | `1.0.0` | Moves to the newest build of that `package.json` version |
| `<package version>-<date>.<run>` | `1.0.0-20260816.42` | Immutable |
| `sha-<commit>` | `sha-a1b2c3…` | Immutable |

`package.json` `version` is the release identity; the date and run number make each build individually addressable even when several builds share a version. Deployments should pin a build or commit tag instead of `latest` — see Quick start and Mount your documents above for the run commands.

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
