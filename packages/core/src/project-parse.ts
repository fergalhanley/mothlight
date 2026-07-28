import type { z } from "zod";
import { PROJECT_SCHEMA_VERSION, type Project, projectSchema } from "./project";

/**
 * Parsing and validation for `project.json`.
 *
 * Import errors are surfaced one at a time, in plain language, naming the segment the
 * user can actually see ("Segment 3 …", not "segments.2.visual.main.assetId"). A wall of
 * zod issues is worse than useless to someone who just tried to open a file.
 */

export type ProjectParseResult = { ok: true; project: Project } | { ok: false; error: string };

// --- Readable errors ------------------------------------------------------------------

/** Turns a zod path into something a person recognises from the editor. */
function describePath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return "This file";

  const [head, index, ...rest] = path;

  // segments[2].visual.main.assetId  ->  Segment 3 → visual.main.assetId
  if ((head === "segments" || head === "assets") && typeof index === "number") {
    const label = head === "segments" ? "Segment" : "Asset";
    const tail = rest.join(".");
    const subject = `${label} ${index + 1}`;
    return tail ? `${subject} → ${tail}` : subject;
  }

  return path.join(".");
}

/**
 * Joins path and message so both zod's own wording and our continuation-style custom
 * messages read as sentences:
 *   "Segment 3 → script: Invalid input: expected string, received number"
 *   "Segment 3 → visual.main.assetId is required when the visual type is \"image\""
 */
function joinPathAndMessage(pathLabel: string, message: string): string {
  return /^[a-z]/.test(message) ? `${pathLabel} ${message}` : `${pathLabel}: ${message}`;
}

/** Formats the first issue only — one actionable problem beats a list of twelve. */
export function formatFirstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "This file is not a valid Mothlight project.";
  return joinPathAndMessage(describePath(issue.path), issue.message);
}

// --- Version gate ---------------------------------------------------------------------

function parseVersion(version: string): { major: number; minor: number } | null {
  const match = /^(\d+)\.(\d+)$/.exec(version.trim());
  if (!match?.[1] || !match[2]) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/**
 * Rejects files from a future build before schema parsing, so the user gets "update the
 * app" rather than a confusing complaint about a field they have never heard of.
 */
function checkSchemaVersion(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = (input as { schemaVersion?: unknown }).schemaVersion;
  if (raw === undefined || raw === null) return null;

  if (typeof raw !== "string") return 'schemaVersion must be a string such as "0.1".';

  const found = parseVersion(raw);
  const current = parseVersion(PROJECT_SCHEMA_VERSION);
  if (!found) return `schemaVersion "${raw}" is not a version number such as "0.1".`;
  if (!current) return null;

  const isNewer =
    found.major > current.major || (found.major === current.major && found.minor > current.minor);

  if (isNewer) {
    return `This project was made with a newer version of Mothlight (schema ${raw}). Update the app to open it.`;
  }
  return null;
}

// --- Referential integrity ------------------------------------------------------------

/**
 * Checks every assetId actually resolves, and to the right kind of asset. zod validates
 * shape; this validates that the file hangs together.
 */
function checkReferences(project: Project): string | null {
  const byId = new Map<string, (typeof project.assets)[number]>();
  for (const asset of project.assets) {
    if (byId.has(asset.id)) return `Two assets share the id "${asset.id}".`;
    byId.set(asset.id, asset);
  }

  const seenSegmentIds = new Set<string>();
  const requireAsset = (id: string, kind: string, where: string): string | null => {
    const asset = byId.get(id);
    if (!asset) return `${where} refers to a missing asset ("${id}").`;
    if (asset.kind !== kind) {
      return `${where} expects ${kind === "audio" ? "an" : "a"} ${kind} asset, but "${id}" is ${
        asset.kind === "audio" ? "an" : "a"
      } ${asset.kind}.`;
    }
    return null;
  };

  if (project.soundtrack.assetId) {
    const problem = requireAsset(project.soundtrack.assetId, "audio", "The soundtrack");
    if (problem) return problem;
  }

  for (const [index, segment] of project.segments.entries()) {
    const label = `Segment ${index + 1}`;

    if (seenSegmentIds.has(segment.id)) return `Two segments share the id "${segment.id}".`;
    seenSegmentIds.add(segment.id);

    const main = segment.visual.main;
    if (main?.assetId && (main.type === "image" || main.type === "video")) {
      const problem = requireAsset(main.assetId, main.type, `${label}'s visual`);
      if (problem) return problem;
    }

    if (segment.audio.vo) {
      const problem = requireAsset(segment.audio.vo.assetId, "audio", `${label}'s voiceover`);
      if (problem) return problem;
    }

    for (const [overlayIndex, overlay] of segment.visual.overlays.entries()) {
      if (overlay.assetId) {
        const problem = requireAsset(
          overlay.assetId,
          "image",
          `${label}'s overlay ${overlayIndex + 1}`,
        );
        if (problem) return problem;
      }
    }
  }

  return null;
}

// --- Entry points ---------------------------------------------------------------------

/**
 * Parses a project as stored by the app. Lenient: missing fields take their defaults, and
 * an empty segment is fine because that is what the editor creates when you tap
 * "Add segment".
 */
export function parseProject(input: unknown): ProjectParseResult {
  const versionProblem = checkSchemaVersion(input);
  if (versionProblem) return { ok: false, error: versionProblem };

  const result = projectSchema.safeParse(input);
  if (!result.success) return { ok: false, error: formatFirstIssue(result.error) };

  const referenceProblem = checkReferences(result.data);
  if (referenceProblem) return { ok: false, error: referenceProblem };

  return { ok: true, project: result.data };
}

/**
 * Parses a project the user is importing. Everything `parseProject` checks, plus the
 * rules that only make sense for a finished file arriving from outside: it must have at
 * least one segment, and each segment must carry either words or a picture.
 *
 * An agent-authored script with scripts but no assets passes — that is the intended
 * workflow, not an error.
 */
export function parseProjectForImport(input: unknown): ProjectParseResult {
  const result = parseProject(input);
  if (!result.ok) return result;

  const { project } = result;

  if (project.segments.length === 0) {
    return { ok: false, error: "This project has no segments." };
  }

  for (const [index, segment] of project.segments.entries()) {
    const hasScript = segment.script.trim().length > 0;
    const hasVisual = segment.visual.main !== null;
    if (!hasScript && !hasVisual) {
      return { ok: false, error: `Segment ${index + 1} has no script or visual.` };
    }
  }

  return { ok: true, project };
}
