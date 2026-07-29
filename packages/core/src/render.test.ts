import { describe, expect, test } from "bun:test";
import type { Project } from "./project";
import { parseProject } from "./project-parse";
import {
  describeRenderJob,
  isTerminalStatus,
  MAX_RENDER_UPLOAD_BYTES,
  preflightRender,
  type RenderJob,
  referencedAssetIds,
  renderJobSchema,
} from "./render";

const IMAGE = {
  id: "asset_1",
  kind: "image",
  uri: "assets/asset_1.jpg",
  source: "photo-library",
};

function build(overrides: Record<string, unknown>): Project {
  const result = parseProject({ schemaVersion: "0.1", name: "Test", ...overrides });
  if (!result.ok) throw new Error(result.error);
  return result.project;
}

const withVisual = (script: string, extra: Record<string, unknown> = {}) => ({
  script,
  visual: { main: { type: "image", assetId: "asset_1" } },
  ...extra,
});

describe("renderJobSchema", () => {
  test("parses a job from the wire and defaults the optional fields", () => {
    const result = renderJobSchema.safeParse({
      id: "job_1",
      status: "queued",
      createdAt: "2026-07-29T00:00:00+00:00",
      updatedAt: "2026-07-29T00:00:00+00:00",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.progress).toBe(0);
    expect(result.data.outputUrl).toBeNull();
    expect(result.data.error).toBeNull();
  });

  test("rejects an unknown status rather than trusting the server", () => {
    const result = renderJobSchema.safeParse({
      id: "job_1",
      status: "exploded",
      createdAt: "2026-07-29T00:00:00+00:00",
      updatedAt: "2026-07-29T00:00:00+00:00",
    });
    expect(result.success).toBe(false);
  });

  test("rejects progress outside 0-1", () => {
    const base = {
      id: "job_1",
      status: "rendering",
      createdAt: "2026-07-29T00:00:00+00:00",
      updatedAt: "2026-07-29T00:00:00+00:00",
    };
    expect(renderJobSchema.safeParse({ ...base, progress: 1.5 }).success).toBe(false);
    expect(renderJobSchema.safeParse({ ...base, progress: -0.1 }).success).toBe(false);
  });
});

describe("isTerminalStatus", () => {
  test.each([
    ["queued", false],
    ["rendering", false],
    ["completed", true],
    ["failed", true],
  ] as const)("%s -> %p", (status, expected) => {
    expect(isTerminalStatus(status)).toBe(expected);
  });
});

describe("describeRenderJob", () => {
  const base: RenderJob = {
    id: "job_1",
    status: "rendering",
    progress: 0,
    outputUrl: null,
    error: null,
    createdAt: "2026-07-29T00:00:00+00:00",
    updatedAt: "2026-07-29T00:00:00+00:00",
  };

  test("reports a percentage once progress is known", () => {
    expect(describeRenderJob({ ...base, progress: 0.42 })).toBe("Rendering — 42%");
  });

  test("avoids a misleading 0% before the engine reports anything", () => {
    expect(describeRenderJob(base)).toBe("Rendering your video…");
  });

  test("surfaces the engine's own message on failure", () => {
    expect(describeRenderJob({ ...base, status: "failed", error: "Out of disk" })).toBe(
      "Out of disk",
    );
  });

  test("falls back to a sentence when a failure carries no message", () => {
    expect(describeRenderJob({ ...base, status: "failed" })).toBe("The render failed.");
  });
});

describe("preflightRender", () => {
  test("passes a complete project", () => {
    const project = build({ segments: [withVisual("a")], assets: [IMAGE] });
    const result = preflightRender(project);
    expect(result.blockers).toEqual([]);
  });

  test("blocks a project with no segments", () => {
    const project = build({ segments: [] });
    expect(preflightRender(project).blockers[0]?.kind).toBe("no-segments");
  });

  test("names every segment still missing a visual", () => {
    const project = build({
      segments: [withVisual("a"), { script: "b" }, { script: "c" }],
      assets: [IMAGE],
    });

    const blockers = preflightRender(project).blockers;
    expect(blockers).toHaveLength(2);
    expect(blockers[0]?.message).toBe("Segment 2 still needs a visual.");
    expect(blockers[1]?.message).toBe("Segment 3 still needs a visual.");
  });

  test("warns past the soft cap but does not block", () => {
    const project = build({
      segments: [withVisual("a", { durationMode: "manual", durationMs: 100_000 })],
      assets: [IMAGE],
    });

    const result = preflightRender(project);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("blocks past the hard cap", () => {
    const project = build({
      segments: [withVisual("a", { durationMode: "manual", durationMs: 200_000 })],
      assets: [IMAGE],
    });
    expect(preflightRender(project).blockers[0]?.kind).toBe("too-long");
  });

  test("blocks an upload over the size cap", () => {
    const project = build({ segments: [withVisual("a")], assets: [IMAGE] });
    const result = preflightRender(project, { asset_1: MAX_RENDER_UPLOAD_BYTES + 1 });
    expect(result.blockers[0]?.kind).toBe("too-large");
  });

  test("counts only referenced assets toward the upload", () => {
    const project = build({
      segments: [withVisual("a")],
      assets: [IMAGE, { ...IMAGE, id: "orphan", uri: "assets/orphan.jpg" }],
    });

    const result = preflightRender(project, { asset_1: 1000, orphan: 999_000 });
    // The orphan is never shown, so it is never uploaded.
    expect(result.uploadBytes).toBe(1000);
  });

  test("counts an asset shared by two segments once", () => {
    const project = build({
      segments: [withVisual("a"), withVisual("b")],
      assets: [IMAGE],
    });
    expect(preflightRender(project, { asset_1: 1000 }).uploadBytes).toBe(1000);
  });

  test("reports duration alongside the verdict", () => {
    const project = build({
      segments: [withVisual("a", { durationMode: "manual", durationMs: 4000 })],
      assets: [IMAGE],
    });
    expect(preflightRender(project).durationMs).toBe(4000);
  });
});

describe("referencedAssetIds", () => {
  test("collects visuals, voiceovers, overlays, and the soundtrack", () => {
    const project = build({
      soundtrack: { assetId: "music_1" },
      segments: [
        {
          script: "a",
          visual: {
            main: { type: "image", assetId: "asset_1" },
            overlays: [{ type: "image", assetId: "ov_asset" }],
          },
          audio: { vo: { assetId: "vo_1" } },
        },
      ],
      assets: [
        IMAGE,
        { ...IMAGE, id: "ov_asset", uri: "assets/ov.jpg" },
        { id: "vo_1", kind: "audio", uri: "assets/vo.m4a", source: "recording" },
        { id: "music_1", kind: "audio", uri: "assets/music.m4a", source: "bundled" },
      ],
    });

    expect([...referencedAssetIds(project)].sort()).toEqual([
      "asset_1",
      "music_1",
      "ov_asset",
      "vo_1",
    ]);
  });

  test("ignores assets nothing points at", () => {
    const project = build({
      segments: [withVisual("a")],
      assets: [IMAGE, { ...IMAGE, id: "orphan", uri: "assets/orphan.jpg" }],
    });
    expect([...referencedAssetIds(project)]).toEqual(["asset_1"]);
  });

  test("is empty for a project with no media", () => {
    expect(referencedAssetIds(build({ segments: [{ script: "a" }] })).size).toBe(0);
  });
});
