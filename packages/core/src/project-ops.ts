import { createId, createUuid } from "./ids";
import {
  type Asset,
  DEFAULT_CANVAS,
  DEFAULT_CAPTION_STYLE,
  DEFAULT_SOUNDTRACK,
  MIN_SEGMENT_DURATION_MS,
  PROJECT_SCHEMA_VERSION,
  type Project,
  type Segment,
  segmentSchema,
} from "./project";

/** Derived values and constructors for projects. Pure — no I/O, no platform APIs. */

export function assetsById(assets: ReadonlyArray<Asset>): Map<string, Asset> {
  return new Map(assets.map((asset) => [asset.id, asset]));
}

/** Playable length of a segment's voiceover, after its trim-in. */
function voiceoverDurationMs(segment: Segment, byId: Map<string, Asset>): number {
  const vo = segment.audio.vo;
  if (!vo) return 0;
  const asset = byId.get(vo.assetId);
  if (!asset?.durationMs) return 0;
  return Math.max(0, asset.durationMs - vo.trimStartMs);
}

/** Playable length of a segment's video clip, after trimming. */
function videoClipDurationMs(segment: Segment, byId: Map<string, Asset>): number {
  const main = segment.visual.main;
  if (main?.type !== "video" || !main.assetId) return 0;

  const asset = byId.get(main.assetId);
  const end = main.trimEndMs ?? asset?.durationMs ?? null;
  if (end === null) return 0;
  return Math.max(0, end - main.trimStartMs);
}

/**
 * How long a segment actually plays for.
 *
 * Auto mode fits the content: the longer of the voiceover and the video clip, and never
 * less than {@link MIN_SEGMENT_DURATION_MS} so a still with no voiceover still holds.
 * Manual mode honours the user's number, except that it can never cut off a voiceover
 * mid-sentence.
 */
export function resolveSegmentDurationMs(
  segment: Segment,
  assets: ReadonlyArray<Asset>,
  byId: Map<string, Asset> = assetsById(assets),
): number {
  const voMs = voiceoverDurationMs(segment, byId);

  if (segment.durationMode === "manual") {
    return Math.max(segment.durationMs, voMs);
  }

  return Math.max(voMs, videoClipDurationMs(segment, byId), MIN_SEGMENT_DURATION_MS);
}

/** Total playback length of the project. */
export function resolveProjectDurationMs(project: Project): number {
  const byId = assetsById(project.assets);
  return project.segments.reduce(
    (total, segment) => total + resolveSegmentDurationMs(segment, project.assets, byId),
    0,
  );
}

/** Start offset of each segment on the project timeline, in order. */
export function resolveSegmentStartsMs(project: Project): number[] {
  const byId = assetsById(project.assets);
  const starts: number[] = [];
  let cursor = 0;
  for (const segment of project.segments) {
    starts.push(cursor);
    cursor += resolveSegmentDurationMs(segment, project.assets, byId);
  }
  return starts;
}

/** A segment's own `captionsEnabled` wins; null means inherit the project default. */
export function resolveCaptionsEnabled(segment: Segment, project: Project): boolean {
  return segment.captionsEnabled ?? project.captionStyle.enabled;
}

/** `125_000` -> `"2:05"`. Used in the dashboard rows and the editor top bar. */
export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// --- Constructors ---------------------------------------------------------------------

/** A blank shot, as created by "Add shot". Valid, but has neither words nor a picture. */
export function createEmptySegment(): Segment {
  return segmentSchema.parse({ id: createId("seg") });
}

/** A new, empty project containing a single blank segment. */
export function createEmptyProject(name = "Untitled project"): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createUuid(),
    name,
    createdAt: now,
    updatedAt: now,
    canvas: { ...DEFAULT_CANVAS },
    captionStyle: { ...DEFAULT_CAPTION_STYLE },
    soundtrack: { ...DEFAULT_SOUNDTRACK },
    segments: [createEmptySegment()],
    assets: [],
  };
}
