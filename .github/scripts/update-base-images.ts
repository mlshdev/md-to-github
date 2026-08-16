#!/usr/bin/env bun
import { appendFile, readFile, writeFile } from "node:fs/promises";

type UpdatePolicy = "major" | "minor" | "patch" | "digest";

interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

interface ImageReference {
  readonly name: string;
  readonly registry: string;
  readonly repository: string;
  readonly tag: string;
  readonly digest: string | null;
}

interface DockerfileLayer {
  readonly lineIndex: number;
  readonly stage: string | null;
  readonly reference: ImageReference;
  readonly policy: UpdatePolicy;
}

interface LayerUpdate {
  readonly layer: DockerfileLayer;
  readonly tag: string;
  readonly digest: string;
  readonly changed: boolean;
}

interface TokenChallenge {
  readonly realm: string;
  readonly service: string | null;
  readonly scope: string | null;
}

const DOCKER_HUB_NAMESPACE = "docker.io";
const DOCKER_HUB_ENDPOINT = "registry-1.docker.io";
const DEFAULT_POLICY: UpdatePolicy = "major";
const POLICY_DIRECTIVE = /^#\s*update-policy:\s*(major|minor|patch|digest)\s*$/i;
const FROM_LINE = /^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?\s*$/i;
const SEMVER_TAG = /^v?(\d+)\.(\d+)\.(\d+)(-[A-Za-z0-9][A-Za-z0-9._-]*)?$/;

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

class RegistryError extends Error {
  constructor(
    readonly reference: string,
    readonly status: number,
    detail: string,
  ) {
    super(`registry request for ${reference} failed with ${status}: ${detail}`);
    this.name = "RegistryError";
  }
}

function isPolicy(value: string): value is UpdatePolicy {
  return value === "major" || value === "minor" || value === "patch" || value === "digest";
}

function parseReference(name: string): ImageReference | null {
  const [nameAndTag = "", digestPart] = name.split("@");
  const separator = nameAndTag.lastIndexOf(":");
  const slash = nameAndTag.lastIndexOf("/");
  const hasTag = separator > slash;
  const path = hasTag ? nameAndTag.slice(0, separator) : nameAndTag;
  const tag = hasTag ? nameAndTag.slice(separator + 1) : "latest";
  if (path === "" || tag === "") return null;

  const segments = path.split("/");
  const first = segments[0] ?? "";
  const hasRegistry = segments.length > 1 && (first.includes(".") || first.includes(":") || first === "localhost");
  const registry = hasRegistry ? first : DOCKER_HUB_NAMESPACE;
  const remainder = hasRegistry ? segments.slice(1).join("/") : path;
  const repository = registry === DOCKER_HUB_NAMESPACE && !remainder.includes("/") ? `library/${remainder}` : remainder;

  return { name: path, registry, repository, tag, digest: digestPart ?? null };
}

function parseSemver(tag: string): { readonly version: SemanticVersion; readonly suffix: string } | null {
  const match = SEMVER_TAG.exec(tag);
  if (!match) return null;
  const [, major = "", minor = "", patch = "", suffix] = match;
  return {
    version: { major: Number(major), minor: Number(minor), patch: Number(patch) },
    suffix: suffix ?? "",
  };
}

function compareVersions(left: SemanticVersion, right: SemanticVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function satisfiesPolicy(current: SemanticVersion, candidate: SemanticVersion, policy: UpdatePolicy): boolean {
  if (policy === "digest") return false;
  if (policy === "patch") return candidate.major === current.major && candidate.minor === current.minor;
  if (policy === "minor") return candidate.major === current.major;
  return true;
}

export function selectTag(currentTag: string, availableTags: readonly string[], policy: UpdatePolicy): string {
  const current = parseSemver(currentTag);
  if (!current || policy === "digest") return currentTag;

  let best = current.version;
  let bestTag = currentTag;
  for (const tag of availableTags) {
    const candidate = parseSemver(tag);
    if (!candidate || candidate.suffix !== current.suffix) continue;
    if (!satisfiesPolicy(current.version, candidate.version, policy)) continue;
    if (compareVersions(candidate.version, best) > 0) {
      best = candidate.version;
      bestTag = tag;
    }
  }
  return bestTag;
}

function registryEndpoint(registry: string): string {
  return registry === DOCKER_HUB_NAMESPACE ? DOCKER_HUB_ENDPOINT : registry;
}

function parseChallenge(header: string): TokenChallenge | null {
  if (!/^bearer /i.test(header)) return null;
  const fields = new Map<string, string>();
  for (const match of header.slice(7).matchAll(/(\w+)="([^"]*)"/g)) {
    const [, key, value] = match;
    if (key !== undefined && value !== undefined) fields.set(key, value);
  }
  const realm = fields.get("realm");
  if (realm === undefined) return null;
  return { realm, service: fields.get("service") ?? null, scope: fields.get("scope") ?? null };
}

const tokenCache = new Map<string, string>();

async function authorize(challenge: TokenChallenge, cacheKey: string): Promise<string> {
  const cached = tokenCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const url = new URL(challenge.realm);
  if (challenge.service !== null) url.searchParams.set("service", challenge.service);
  if (challenge.scope !== null) url.searchParams.set("scope", challenge.scope);

  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new RegistryError(cacheKey, response.status, "token request rejected");

  const payload: unknown = await response.json();
  const token =
    typeof payload === "object" && payload !== null
      ? ((payload as Record<string, unknown>)["token"] ?? (payload as Record<string, unknown>)["access_token"])
      : undefined;
  if (typeof token !== "string") throw new RegistryError(cacheKey, response.status, "token missing from response");

  tokenCache.set(cacheKey, token);
  return token;
}

async function registryFetch(reference: ImageReference, path: string, method: "GET" | "HEAD"): Promise<Response> {
  const url = `https://${registryEndpoint(reference.registry)}${path}`;
  const headers: Record<string, string> = { accept: MANIFEST_ACCEPT };
  const cacheKey = `${reference.registry}/${reference.repository}`;

  const cached = tokenCache.get(cacheKey);
  if (cached !== undefined) headers["authorization"] = `Bearer ${cached}`;

  const first = await fetch(url, { method, headers });
  if (first.status !== 401) return first;

  const challenge = parseChallenge(first.headers.get("www-authenticate") ?? "");
  if (challenge === null) throw new RegistryError(cacheKey, first.status, "no bearer challenge offered");

  tokenCache.delete(cacheKey);
  headers["authorization"] = `Bearer ${await authorize(challenge, cacheKey)}`;
  return await fetch(url, { method, headers });
}

async function listTags(reference: ImageReference): Promise<readonly string[]> {
  const tags: string[] = [];
  let path = `/v2/${reference.repository}/tags/list?n=1000`;

  while (true) {
    const response = await registryFetch(reference, path, "GET");
    if (!response.ok) throw new RegistryError(reference.name, response.status, await response.text());

    const payload: unknown = await response.json();
    const listed = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>)["tags"] : null;
    if (Array.isArray(listed)) tags.push(...listed.filter((tag): tag is string => typeof tag === "string"));

    const link = response.headers.get("link");
    const next = link === null ? null : /<([^>]+)>\s*;\s*rel="next"/.exec(link)?.[1];
    if (next === null || next === undefined) return tags;
    path = next.startsWith("/") ? next : `/${next}`;
  }
}

async function resolveDigest(reference: ImageReference, tag: string): Promise<string> {
  const path = `/v2/${reference.repository}/manifests/${tag}`;
  for (const method of ["HEAD", "GET"] as const) {
    const response = await registryFetch(reference, path, method);
    if (!response.ok) throw new RegistryError(`${reference.name}:${tag}`, response.status, await response.text());
    const digest = response.headers.get("docker-content-digest");
    if (digest !== null) return digest;
  }
  throw new RegistryError(`${reference.name}:${tag}`, 200, "registry did not return a content digest");
}

export function parseDockerfile(contents: string): readonly DockerfileLayer[] {
  const lines = contents.split("\n");
  const stages = new Set<string>();
  const layers: DockerfileLayer[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    const match = FROM_LINE.exec(line.trim());
    if (match === null) continue;

    const [, ref = "", stage] = match;
    if (stage !== undefined) stages.add(stage.toLowerCase());
    if (ref.toLowerCase() === "scratch" || stages.has(ref.toLowerCase())) continue;

    const reference = parseReference(ref);
    if (reference === null) continue;

    const directive = POLICY_DIRECTIVE.exec(lines[lineIndex - 1]?.trim() ?? "")?.[1]?.toLowerCase();
    const policy = directive !== undefined && isPolicy(directive) ? directive : DEFAULT_POLICY;

    layers.push({ lineIndex, stage: stage ?? null, reference, policy });
  }

  return layers;
}

function renderLayer(line: string, layer: DockerfileLayer, update: LayerUpdate): string {
  const current = `${layer.reference.name}:${layer.reference.tag}${layer.reference.digest === null ? "" : `@${layer.reference.digest}`}`;
  return line.replace(current, `${layer.reference.name}:${update.tag}@${update.digest}`);
}

async function emit(file: string | undefined, body: string): Promise<void> {
  if (file === undefined || file === "") return;
  await appendFile(file, body);
}

async function main(): Promise<number> {
  const dockerfile = process.argv[2] ?? "Dockerfile";
  const dryRun = process.argv.includes("--dry-run");

  const contents = await readFile(dockerfile, "utf8");
  const lines = contents.split("\n");
  const layers = parseDockerfile(contents);

  if (layers.length === 0) {
    console.error(`no external base images found in ${dockerfile}`);
    return 1;
  }

  const updates: LayerUpdate[] = [];
  for (const layer of layers) {
    const tags = layer.policy === "digest" ? [] : await listTags(layer.reference);
    const tag = selectTag(layer.reference.tag, tags, layer.policy);
    const digest = await resolveDigest(layer.reference, tag);
    updates.push({
      layer,
      tag,
      digest,
      changed: tag !== layer.reference.tag || digest !== layer.reference.digest,
    });
  }

  for (const update of updates) {
    if (!update.changed) continue;
    const line = lines[update.layer.lineIndex];
    if (line === undefined) continue;
    lines[update.layer.lineIndex] = renderLayer(line, update.layer, update);
  }

  const changed = updates.filter((update) => update.changed);
  if (changed.length > 0 && !dryRun) await writeFile(dockerfile, lines.join("\n"), "utf8");

  const rows = updates.map((update) => {
    const from = `${update.layer.reference.name}:${update.layer.reference.tag}`;
    const to = `${update.layer.reference.name}:${update.tag}`;
    const state = update.changed ? "updated" : "current";
    return `| \`${update.layer.stage ?? "-"}\` | \`${from}\` | \`${to}\` | \`${update.digest.slice(0, 19)}…\` | ${state} |`;
  });

  await emit(process.env["GITHUB_STEP_SUMMARY"], `## Base image scan\n\n| Stage | From | To | Digest | Status |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`);
  await emit(process.env["GITHUB_OUTPUT"], `updated=${changed.length > 0 ? "true" : "false"}\n`);
  await emit(
    process.env["GITHUB_OUTPUT"],
    `images=${changed.map((update) => `${update.layer.reference.name}:${update.tag}`).join(" ")}\n`,
  );

  console.log(rows.join("\n"));
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main();
}
