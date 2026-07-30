import { describe, expect, test } from "bun:test";
import { toSafeFilename, toScriptMarkdown } from "./export";
import { toFcp7Xml } from "./export-xml";
import type { Project } from "./project";
import { createEmptyProject } from "./project-ops";
import { parseProject } from "./project-parse";

function build(overrides: Record<string, unknown>): Project {
  const result = parseProject({
    schemaVersion: "0.1",
    name: "Why moths chase light",
    ...overrides,
  });
  if (!result.ok) throw new Error(result.error);
  return result.project;
}

const IMAGE = {
  id: "asset_1",
  kind: "image",
  uri: "assets/asset_1.jpg",
  source: "photo-library",
  originalFilename: "IMG_0421.HEIC",
  width: 1080,
  height: 1920,
};

const VO = {
  id: "vo_1",
  kind: "audio",
  uri: "assets/vo_1.m4a",
  source: "recording",
  durationMs: 5000,
};

describe("toSafeFilename", () => {
  test.each([
    ["Why moths chase light", "Why-moths-chase-light.md"],
    ["  spaced   out  ", "spaced-out.md"],
    ["slashes/and:colons", "slashesandcolons.md"],
  ])("turns %p into %p", (name, expected) => {
    expect(toSafeFilename(name, "md")).toBe(expected);
  });

  test("falls back when a name reduces to nothing", () => {
    expect(toSafeFilename("///", "json")).toBe("mothlight-project.json");
    expect(toSafeFilename("", "json")).toBe("mothlight-project.json");
  });

  test("does not produce a leading or trailing dot", () => {
    const name = toSafeFilename("...hidden...", "md");
    expect(name.startsWith(".")).toBe(false);
    expect(name).toBe("hidden.md");
  });

  test("truncates absurdly long names", () => {
    expect(toSafeFilename("a".repeat(500), "md").length).toBeLessThanOrEqual(64);
  });
});

describe("toScriptMarkdown", () => {
  test("writes a title and one heading per segment", () => {
    const project = build({
      segments: [
        { script: "Moths don't love light.", durationMode: "manual", durationMs: 4000 },
        { script: "They're lost.", durationMode: "manual", durationMs: 3000 },
      ],
    });

    const md = toScriptMarkdown(project);
    expect(md).toContain("# Why moths chase light");
    expect(md).toContain("## Shot 1 — 0:04");
    expect(md).toContain("Moths don't love light.");
    expect(md).toContain("## Shot 2 — 0:03");
    expect(md).toContain("They're lost.");
  });

  test("marks an empty segment rather than leaving a blank", () => {
    const project = build({ segments: [{ script: "   " }] });
    expect(toScriptMarkdown(project)).toContain("_No script yet._");
  });

  test("handles a project with no segments", () => {
    const project = build({ segments: [] });
    expect(toScriptMarkdown(project)).toContain("_No shots yet._");
  });

  test("a new project round-trips without throwing", () => {
    expect(() => toScriptMarkdown(createEmptyProject("Test"))).not.toThrow();
  });
});

describe("toFcp7Xml", () => {
  const resolveAssetPath = (uri: string) => `/data/projects/p1/${uri}`;

  test("emits a well-formed xmeml document", () => {
    const project = build({
      segments: [{ script: "a", visual: { main: { type: "image", assetId: "asset_1" } } }],
      assets: [IMAGE],
    });

    const xml = toFcp7Xml(project, { resolveAssetPath });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<!DOCTYPE xmeml>");
    expect(xml).toContain('<xmeml version="5">');
    expect(xml.trimEnd().endsWith("</xmeml>")).toBe(true);

    // Every opened tag closes.
    const opens = xml.match(/<(sequence|media|video|audio|track|clipitem|file)>/g) ?? [];
    for (const tag of new Set(opens)) {
      const name = tag.slice(1, -1);
      const openCount = (xml.match(new RegExp(`<${name}[ >]`, "g")) ?? []).length;
      const closeCount = (xml.match(new RegExp(`</${name}>`, "g")) ?? []).length;
      expect(closeCount).toBeGreaterThan(0);
      expect(openCount).toBeGreaterThanOrEqual(closeCount);
    }
  });

  test("converts milliseconds to frames at the project rate", () => {
    const project = build({
      segments: [
        {
          script: "a",
          durationMode: "manual",
          durationMs: 4000,
          visual: { main: { type: "image", assetId: "asset_1" } },
        },
      ],
      assets: [IMAGE],
    });

    const xml = toFcp7Xml(project, { resolveAssetPath });
    // 4000ms at 30fps = 120 frames.
    expect(xml).toContain("<duration>120</duration>");
    expect(xml).toContain("<start>0</start>");
    expect(xml).toContain("<end>120</end>");
  });

  test("keeps later clips at the right timecode when a colour segment leaves a gap", () => {
    const project = build({
      segments: [
        {
          script: "colour",
          durationMode: "manual",
          durationMs: 2000,
          visual: { main: { type: "color", color: "#112233" } },
        },
        {
          script: "image",
          durationMode: "manual",
          durationMs: 3000,
          visual: { main: { type: "image", assetId: "asset_1" } },
        },
      ],
      assets: [IMAGE],
    });

    const xml = toFcp7Xml(project, { resolveAssetPath });
    // Only the image produces a clip, and it starts at 2000ms = 60 frames.
    expect((xml.match(/<clipitem id="clipitem-v/g) ?? []).length).toBe(1);
    expect(xml).toContain("<start>60</start>");
    expect(xml).toContain("<end>150</end>");
  });

  test("writes a voiceover onto the audio track", () => {
    const project = build({
      segments: [
        {
          script: "a",
          visual: { main: { type: "image", assetId: "asset_1" } },
          audio: { vo: { assetId: "vo_1" } },
        },
      ],
      assets: [IMAGE, VO],
    });

    const xml = toFcp7Xml(project, { resolveAssetPath });
    expect(xml).toContain('clipitem-a1"');
    expect(xml).toContain("Shot 1 VO");
    expect(xml).toContain("<samplerate>48000</samplerate>");
  });

  test("defines each file once and references it by id thereafter", () => {
    const project = build({
      segments: [
        { script: "a", visual: { main: { type: "image", assetId: "asset_1" } } },
        { script: "b", visual: { main: { type: "image", assetId: "asset_1" } } },
      ],
      assets: [IMAGE],
    });

    const xml = toFcp7Xml(project, { resolveAssetPath });
    expect((xml.match(/<pathurl>/g) ?? []).length).toBe(1);
    expect(xml).toContain('<file id="file-1"/>');
  });

  test("escapes XML-significant characters in names", () => {
    const project = build({
      name: 'Moths & "light" <tricky>',
      segments: [{ script: "a", visual: { main: { type: "image", assetId: "asset_1" } } }],
      assets: [IMAGE],
    });

    const xml = toFcp7Xml(project, { resolveAssetPath });
    expect(xml).toContain("Moths &amp; &quot;light&quot; &lt;tricky&gt;");
    expect(xml).not.toContain("<tricky>");
  });

  test("writes an absolute file://localhost path url", () => {
    const project = build({
      segments: [{ script: "a", visual: { main: { type: "image", assetId: "asset_1" } } }],
      assets: [IMAGE],
    });

    const xml = toFcp7Xml(project, { resolveAssetPath });
    expect(xml).toContain(
      "<pathurl>file://localhost/data/projects/p1/assets/asset_1.jpg</pathurl>",
    );
  });

  test("an empty project still produces a valid document", () => {
    const project = build({ segments: [] });
    const xml = toFcp7Xml(project, { resolveAssetPath });
    expect(xml).toContain("<duration>0</duration>");
    expect(xml.trimEnd().endsWith("</xmeml>")).toBe(true);
  });
});
