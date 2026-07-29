import type { Project } from "./project";
import { assetsById, formatDurationMs, resolveSegmentDurationMs } from "./project-ops";

/**
 * Export formats. All pure string producers — the app writes them to disk and hands the
 * file to the OS share sheet.
 */

/**
 * Turns a project name into something safe to write to disk and hand to a share sheet.
 * Falls back rather than producing an empty or dot-only filename.
 */
export function toSafeFilename(name: string, extension: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);

  return `${cleaned || "mothlight-project"}.${extension}`;
}

/**
 * The script as a readable document: project title, then one heading and one block of
 * words per segment. This is what someone sends to a client, a voice artist, or reads off
 * a phone while recording.
 */
export function toScriptMarkdown(project: Project): string {
  const byId = assetsById(project.assets);

  const lines: string[] = [`# ${project.name}`, ""];

  if (project.segments.length === 0) {
    lines.push("_No segments yet._", "");
    return lines.join("\n");
  }

  for (const [index, segment] of project.segments.entries()) {
    const durationMs = resolveSegmentDurationMs(segment, project.assets, byId);
    lines.push(`## Segment ${index + 1} — ${formatDurationMs(durationMs)}`, "");

    const script = segment.script.trim();
    lines.push(script.length > 0 ? script : "_No script yet._", "");
  }

  return lines.join("\n");
}
