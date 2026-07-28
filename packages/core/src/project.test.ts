import { describe, expect, test } from "bun:test";
import { MIN_SEGMENT_DURATION_MS, PROJECT_SCHEMA_VERSION, type Segment } from "./project";
import {
  createEmptyProject,
  createEmptySegment,
  formatDurationMs,
  resolveCaptionsEnabled,
  resolveProjectDurationMs,
  resolveSegmentDurationMs,
  resolveSegmentStartsMs,
} from "./project-ops";
import { parseProject, parseProjectForImport } from "./project-parse";

/** The minimum an agent has to write: a name and some scripts. */
const AGENT_SCRIPT = {
  schemaVersion: "0.1",
  name: "Why moths chase light",
  segments: [
    { script: "Moths don't love light. They're lost." },
    { script: "They navigate by the moon." },
  ],
};

describe("parsing an agent-authored script", () => {
  test("accepts a file with scripts and no assets", () => {
    const result = parseProjectForImport(AGENT_SCRIPT);
    expect(result.ok).toBe(true);
  });

  test("fills in every default so the app never sees a missing field", () => {
    const result = parseProject(AGENT_SCRIPT);
    if (!result.ok) throw new Error(result.error);

    const { project } = result;
    expect(project.canvas).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(project.captionStyle.enabled).toBe(true);
    expect(project.captionStyle.position).toBe("lower-third");
    expect(project.soundtrack.assetId).toBeNull();
    expect(project.soundtrack.gainDb).toBe(-18);
    expect(project.assets).toEqual([]);
  });

  test("gives every segment an id and an empty visual placeholder", () => {
    const result = parseProject(AGENT_SCRIPT);
    if (!result.ok) throw new Error(result.error);

    for (const segment of result.project.segments) {
      expect(segment.id.length).toBeGreaterThan(0);
      expect(segment.visual.main).toBeNull();
      expect(segment.visual.overlays).toEqual([]);
      expect(segment.durationMode).toBe("auto");
    }
  });

  test("generates distinct segment ids", () => {
    const result = parseProject(AGENT_SCRIPT);
    if (!result.ok) throw new Error(result.error);
    const ids = result.project.segments.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("schema version gate", () => {
  test("rejects a newer schema with an actionable message", () => {
    const result = parseProject({ ...AGENT_SCRIPT, schemaVersion: "0.2" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("newer version of Mothlight");
  });

  test("accepts the current schema version", () => {
    const result = parseProject({ ...AGENT_SCRIPT, schemaVersion: PROJECT_SCHEMA_VERSION });
    expect(result.ok).toBe(true);
  });

  test("rejects a non-version string", () => {
    const result = parseProject({ ...AGENT_SCRIPT, schemaVersion: "banana" });
    expect(result.ok).toBe(false);
  });
});

describe("import-only rules", () => {
  test("rejects a project with no segments", () => {
    const result = parseProjectForImport({ ...AGENT_SCRIPT, segments: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no segments");
  });

  test("names the offending segment when it has neither script nor visual", () => {
    const result = parseProjectForImport({
      ...AGENT_SCRIPT,
      segments: [{ script: "fine" }, { script: "also fine" }, { script: "   " }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Segment 3 has no script or visual.");
  });

  test("an empty segment is fine when loading, but not when importing", () => {
    const withBlank = { ...AGENT_SCRIPT, segments: [{ script: "" }] };
    expect(parseProject(withBlank).ok).toBe(true);
    expect(parseProjectForImport(withBlank).ok).toBe(false);
  });
});

describe("readable validation errors", () => {
  test("names the segment a user can see, not the array index", () => {
    const result = parseProject({
      ...AGENT_SCRIPT,
      segments: [{ script: "ok" }, { script: 42 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Segment 2");
    expect(result.error).not.toContain("segments.1");
  });

  test("explains a coherence failure in the visual", () => {
    const result = parseProject({
      ...AGENT_SCRIPT,
      segments: [{ script: "ok", visual: { main: { type: "image" } } }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Segment 1");
    expect(result.error).toContain("is required");
  });

  test("rejects a malformed hex colour", () => {
    const result = parseProject({
      ...AGENT_SCRIPT,
      captionStyle: { color: "white" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("hex colour");
  });
});

describe("referential integrity", () => {
  const imageAsset = {
    id: "asset_1",
    kind: "image",
    uri: "assets/asset_1.jpg",
    source: "photo-library",
  };

  test("accepts a visual pointing at a real asset of the right kind", () => {
    const result = parseProject({
      ...AGENT_SCRIPT,
      segments: [{ script: "ok", visual: { main: { type: "image", assetId: "asset_1" } } }],
      assets: [imageAsset],
    });
    expect(result.ok).toBe(true);
  });

  test("rejects a dangling asset reference", () => {
    const result = parseProject({
      ...AGENT_SCRIPT,
      segments: [{ script: "ok", visual: { main: { type: "image", assetId: "nope" } } }],
      assets: [imageAsset],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("missing asset");
  });

  test("rejects a visual pointing at the wrong kind of asset", () => {
    const result = parseProject({
      ...AGENT_SCRIPT,
      segments: [{ script: "ok", visual: { main: { type: "video", assetId: "asset_1" } } }],
      assets: [imageAsset],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("video asset");
  });

  test("rejects a soundtrack pointing at an image", () => {
    const result = parseProject({
      ...AGENT_SCRIPT,
      soundtrack: { assetId: "asset_1" },
      assets: [imageAsset],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("soundtrack");
  });

  test("rejects duplicate asset ids", () => {
    const result = parseProject({ ...AGENT_SCRIPT, assets: [imageAsset, imageAsset] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("share the id");
  });
});

describe("duration rules", () => {
  const voAsset = {
    id: "vo_1",
    kind: "audio" as const,
    uri: "assets/vo_1.m4a",
    source: "recording" as const,
    originalFilename: null,
    durationMs: 7000,
    width: null,
    height: null,
  };

  function segmentWith(overrides: Partial<Segment>): Segment {
    return { ...createEmptySegment(), ...overrides };
  }

  test("a still with no voiceover holds for the 3s floor", () => {
    const segment = segmentWith({});
    expect(resolveSegmentDurationMs(segment, [])).toBe(MIN_SEGMENT_DURATION_MS);
  });

  test("auto mode stretches to fit the voiceover", () => {
    const segment = segmentWith({
      audio: { vo: { assetId: "vo_1", gainDb: 0, trimStartMs: 0 }, sfx: [] },
    });
    expect(resolveSegmentDurationMs(segment, [voAsset])).toBe(7000);
  });

  test("auto mode accounts for the voiceover trim-in", () => {
    const segment = segmentWith({
      audio: { vo: { assetId: "vo_1", gainDb: 0, trimStartMs: 2000 }, sfx: [] },
    });
    expect(resolveSegmentDurationMs(segment, [voAsset])).toBe(5000);
  });

  test("manual mode is authoritative", () => {
    const segment = segmentWith({ durationMode: "manual", durationMs: 12_000 });
    expect(resolveSegmentDurationMs(segment, [])).toBe(12_000);
  });

  test("manual mode still never cuts off a voiceover", () => {
    const segment = segmentWith({
      durationMode: "manual",
      durationMs: 1000,
      audio: { vo: { assetId: "vo_1", gainDb: 0, trimStartMs: 0 }, sfx: [] },
    });
    expect(resolveSegmentDurationMs(segment, [voAsset])).toBe(7000);
  });

  test("a trimmed video clip drives the duration", () => {
    const clip = {
      id: "clip_1",
      kind: "video" as const,
      uri: "assets/clip_1.mp4",
      source: "photo-library" as const,
      originalFilename: null,
      durationMs: 30_000,
      width: 1080,
      height: 1920,
    };
    const segment = segmentWith({
      visual: {
        main: {
          type: "video",
          assetId: "clip_1",
          fit: "cover",
          color: null,
          trimStartMs: 1000,
          trimEndMs: 6000,
          muteSourceAudio: true,
          kenBurns: { enabled: false, from: "center", to: "zoom-in" },
        },
        overlays: [],
        effects: [],
      },
    });
    expect(resolveSegmentDurationMs(segment, [clip])).toBe(5000);
  });

  test("project duration is the sum, and segment starts accumulate", () => {
    const result = parseProject({
      ...AGENT_SCRIPT,
      segments: [
        { script: "a", durationMode: "manual", durationMs: 4000 },
        { script: "b", durationMode: "manual", durationMs: 5000 },
        { script: "c" },
      ],
    });
    if (!result.ok) throw new Error(result.error);

    expect(resolveProjectDurationMs(result.project)).toBe(12_000);
    expect(resolveSegmentStartsMs(result.project)).toEqual([0, 4000, 9000]);
  });
});

describe("caption inheritance", () => {
  test("null inherits the project default", () => {
    const project = createEmptyProject();
    const segment = { ...createEmptySegment(), captionsEnabled: null };
    expect(resolveCaptionsEnabled(segment, project)).toBe(true);

    project.captionStyle.enabled = false;
    expect(resolveCaptionsEnabled(segment, project)).toBe(false);
  });

  test("an explicit value overrides the project default", () => {
    const project = createEmptyProject();
    project.captionStyle.enabled = false;
    const segment = { ...createEmptySegment(), captionsEnabled: true };
    expect(resolveCaptionsEnabled(segment, project)).toBe(true);
  });
});

describe("constructors", () => {
  test("a new project round-trips through the parser", () => {
    const project = createEmptyProject("My film");
    const result = parseProject(JSON.parse(JSON.stringify(project)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.name).toBe("My film");
    expect(result.project.segments).toHaveLength(1);
  });
});

describe("formatDurationMs", () => {
  test.each([
    [0, "0:00"],
    [5_000, "0:05"],
    [42_000, "0:42"],
    [125_000, "2:05"],
  ])("formats %ims as %s", (ms, expected) => {
    expect(formatDurationMs(ms)).toBe(expected);
  });
});
