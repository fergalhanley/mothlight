import type { Asset, Project, Segment } from "./project";
import { assetsById, resolveSegmentDurationMs, resolveSegmentStartsMs } from "./project-ops";

/**
 * FCP7 XML (`xmeml` version 5) — the interchange format DaVinci Resolve and Premiere
 * still read.
 *
 * Two caveats, both from §8 of the requirements and both real:
 *
 * 1. **Media is referenced by path, never embedded.** The XML is only useful alongside
 *    the actual asset files. The app writes the assets next to the XML on export; if the
 *    user moves one without the other, the NLE will show offline media.
 * 2. **Solid-colour segments produce a gap.** A colour card is not a media file, and
 *    FCP7 generators are not portable enough to be worth it. The gap keeps every later
 *    clip at the right timecode, which matters more than filling the hole.
 *
 * Text overlays and captions are not exported either — they are burned in by the
 * renderer, and round-tripping them as titles is a v0.1 problem.
 */

/** Escapes the five XML predefined entities. Project and file names are user input. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function msToFrames(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps));
}

/** FCP7 wants `file://localhost/...` with an absolute path. */
function toPathUrl(absolutePath: string): string {
  const withoutScheme = absolutePath.replace(/^file:\/\/(localhost)?/, "");
  const normalised = withoutScheme.startsWith("/") ? withoutScheme : `/${withoutScheme}`;
  return `file://localhost${normalised.split("/").map(encodeURIComponent).join("/")}`;
}

function rateElement(fps: number, indent: string): string {
  return [
    `${indent}<rate>`,
    `${indent}  <timebase>${fps}</timebase>`,
    `${indent}  <ntsc>FALSE</ntsc>`,
    `${indent}</rate>`,
  ].join("\n");
}

type FileRef = { id: string; emitted: boolean };

export type Fcp7Options = {
  /** Turns a stored (relative) asset URI into an absolute filesystem path. */
  resolveAssetPath: (uri: string) => string;
};

export function toFcp7Xml(project: Project, options: Fcp7Options): string {
  const fps = project.canvas.fps;
  const byId = assetsById(project.assets);
  const starts = resolveSegmentStartsMs(project);

  const totalMs = project.segments.reduce(
    (total, segment) => total + resolveSegmentDurationMs(segment, project.assets, byId),
    0,
  );

  // A file element is defined once and referenced by id afterwards, which is what FCP7
  // expects and what stops Resolve importing the same asset several times.
  const fileRefs = new Map<string, FileRef>();
  let nextFileId = 1;

  function fileElement(asset: Asset, indent: string): string {
    let ref = fileRefs.get(asset.id);
    if (!ref) {
      ref = { id: `file-${nextFileId++}`, emitted: false };
      fileRefs.set(asset.id, ref);
    }

    if (ref.emitted) return `${indent}<file id="${ref.id}"/>`;
    ref.emitted = true;

    const name = escapeXml(asset.originalFilename ?? asset.uri.split("/").pop() ?? asset.id);
    const pathUrl = escapeXml(toPathUrl(options.resolveAssetPath(asset.uri)));

    const lines = [
      `${indent}<file id="${ref.id}">`,
      `${indent}  <name>${name}</name>`,
      `${indent}  <pathurl>${pathUrl}</pathurl>`,
      rateElement(fps, `${indent}  `),
      `${indent}  <media>`,
    ];

    if (asset.kind === "audio") {
      lines.push(
        `${indent}    <audio>`,
        `${indent}      <samplecharacteristics>`,
        `${indent}        <depth>16</depth>`,
        `${indent}        <samplerate>48000</samplerate>`,
        `${indent}      </samplecharacteristics>`,
        `${indent}      <channelcount>2</channelcount>`,
        `${indent}    </audio>`,
      );
    } else {
      lines.push(
        `${indent}    <video>`,
        `${indent}      <samplecharacteristics>`,
        `${indent}        <width>${asset.width ?? project.canvas.width}</width>`,
        `${indent}        <height>${asset.height ?? project.canvas.height}</height>`,
        `${indent}      </samplecharacteristics>`,
        `${indent}    </video>`,
      );
    }

    lines.push(`${indent}  </media>`, `${indent}</file>`);
    return lines.join("\n");
  }

  function videoClip(segment: Segment, index: number, startMs: number, durationMs: number) {
    const main = segment.visual.main;
    if (!main || main.type === "color" || !main.assetId) return null;

    const asset = byId.get(main.assetId);
    if (!asset) return null;

    const startFrames = msToFrames(startMs, fps);
    const durationFrames = msToFrames(durationMs, fps);
    // Stills have no intrinsic in-point; video honours its trim.
    const inFrames = main.type === "video" ? msToFrames(main.trimStartMs, fps) : 0;

    return [
      `        <clipitem id="clipitem-v${index + 1}">`,
      `          <name>${escapeXml(`Segment ${index + 1}`)}</name>`,
      `          <duration>${durationFrames}</duration>`,
      rateElement(fps, "          "),
      `          <start>${startFrames}</start>`,
      `          <end>${startFrames + durationFrames}</end>`,
      `          <in>${inFrames}</in>`,
      `          <out>${inFrames + durationFrames}</out>`,
      fileElement(asset, "          "),
      `        </clipitem>`,
    ].join("\n");
  }

  function audioClip(segment: Segment, index: number, startMs: number, durationMs: number) {
    const vo = segment.audio.vo;
    if (!vo) return null;

    const asset = byId.get(vo.assetId);
    if (!asset) return null;

    const startFrames = msToFrames(startMs, fps);
    const durationFrames = msToFrames(durationMs, fps);
    const inFrames = msToFrames(vo.trimStartMs, fps);

    return [
      `        <clipitem id="clipitem-a${index + 1}">`,
      `          <name>${escapeXml(`Segment ${index + 1} VO`)}</name>`,
      `          <duration>${durationFrames}</duration>`,
      rateElement(fps, "          "),
      `          <start>${startFrames}</start>`,
      `          <end>${startFrames + durationFrames}</end>`,
      `          <in>${inFrames}</in>`,
      `          <out>${inFrames + durationFrames}</out>`,
      fileElement(asset, "          "),
      `        </clipitem>`,
    ].join("\n");
  }

  const videoClips: string[] = [];
  const audioClips: string[] = [];

  for (const [index, segment] of project.segments.entries()) {
    const startMs = starts[index] ?? 0;
    const durationMs = resolveSegmentDurationMs(segment, project.assets, byId);

    const video = videoClip(segment, index, startMs, durationMs);
    if (video) videoClips.push(video);

    const audio = audioClip(segment, index, startMs, durationMs);
    if (audio) audioClips.push(audio);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!DOCTYPE xmeml>",
    '<xmeml version="5">',
    "  <sequence>",
    `    <name>${escapeXml(project.name)}</name>`,
    `    <duration>${msToFrames(totalMs, fps)}</duration>`,
    rateElement(fps, "    "),
    "    <media>",
    "      <video>",
    "        <format>",
    "          <samplecharacteristics>",
    rateElement(fps, "            "),
    `            <width>${project.canvas.width}</width>`,
    `            <height>${project.canvas.height}</height>`,
    "            <pixelaspectratio>square</pixelaspectratio>",
    "          </samplecharacteristics>",
    "        </format>",
    "        <track>",
    ...videoClips,
    "        </track>",
    "      </video>",
    "      <audio>",
    "        <track>",
    ...audioClips,
    "        </track>",
    "      </audio>",
    "    </media>",
    "  </sequence>",
    "</xmeml>",
    "",
  ].join("\n");
}
