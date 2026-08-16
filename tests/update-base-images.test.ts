import { describe, expect, test } from "bun:test";
import { parseDockerfile, selectTag } from "../.github/scripts/update-base-images.ts";

const DOCKERFILE = [
  "# update-policy: minor",
  "FROM docker.io/oven/bun:1.3.14@sha256:aaaa AS install",
  "FROM install AS build",
  "FROM ghcr.io/example/tool:2.0.1 AS tool",
  "FROM scratch AS empty",
  "FROM docker.io/oven/bun:1.3.14@sha256:aaaa AS runtime",
].join("\n");

describe("parseDockerfile", () => {
  const layers = parseDockerfile(DOCKERFILE);

  test("skips internal stages and scratch", () => {
    expect(layers.map((layer) => layer.stage)).toEqual(["install", "tool", "runtime"]);
  });

  test("splits a reference into registry, repository, tag and digest", () => {
    expect(layers[0]?.reference).toEqual({
      name: "docker.io/oven/bun",
      registry: "docker.io",
      repository: "oven/bun",
      tag: "1.3.14",
      digest: "sha256:aaaa",
    });
  });

  test("reads the policy directive above a FROM and defaults to major", () => {
    expect(layers[0]?.policy).toBe("minor");
    expect(layers[1]?.policy).toBe("major");
  });
});

describe("selectTag", () => {
  const tags = ["1.3.14", "1.4.0", "2.0.0", "1.3.15-slim", "latest", "canary", "1.3.15"];

  test("major takes the newest release", () => {
    expect(selectTag("1.3.14", tags, "major")).toBe("2.0.0");
  });

  test("minor stays inside the current major", () => {
    expect(selectTag("1.3.14", tags, "minor")).toBe("1.4.0");
  });

  test("patch stays inside the current major.minor", () => {
    expect(selectTag("1.3.14", tags, "patch")).toBe("1.3.15");
  });

  test("digest never moves the tag", () => {
    expect(selectTag("1.3.14", tags, "digest")).toBe("1.3.14");
  });

  test("variant suffixes only match the same variant", () => {
    expect(selectTag("1.3.14-slim", tags, "major")).toBe("1.3.15-slim");
  });

  test("a non-semver tag is left alone", () => {
    expect(selectTag("latest", tags, "major")).toBe("latest");
  });

  test("never downgrades", () => {
    expect(selectTag("3.0.0", tags, "major")).toBe("3.0.0");
  });
});
