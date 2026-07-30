import { z } from "zod";
import type { Project } from "./project";
import { HARD_MAX_PROJECT_DURATION_MS, SOFT_MAX_PROJECT_DURATION_MS } from "./project";
import { assetsById, resolveProjectDurationMs } from "./project-ops";

/**
 * The render contract — shared by the app and whatever engine actually does the work.
 *
 * §7B is explicit that Android may grow a native Media3 renderer later while iOS stays on
 * the server. So nothing here mentions HTTP, Remotion, or Media3: the app depends on this
 * shape, and swapping engines is a module swap rather than a rewrite.
 */

/** §7. One profile, matching the canvas — v0 renders exactly one thing. */
export const RENDER_OUTPUT = {
  width: 1080,
  height: 1920,
  fps: 30,
  videoCodec: "h264",
  videoProfile: "high",
  /** ~8-10 Mbps. */
  videoBitrateKbps: 9000,
  audioCodec: "aac",
  audioBitrateKbps: 128,
  audioChannels: 2,
  /** Moves the moov atom to the front so the file plays while still downloading. */
  faststart: true,
} as const;

/** §7 caps a v0 upload at roughly this, to keep render cost and wait times sane. */
export const MAX_RENDER_UPLOAD_BYTES = 150 * 1024 * 1024;

export const renderJobStatusSchema = z.enum(["queued", "rendering", "completed", "failed"]);
export type RenderJobStatus = z.infer<typeof renderJobStatusSchema>;

export const renderJobSchema = z.object({
  id: z.string().min(1),
  status: renderJobStatusSchema,
  /** 0–1. Engines that cannot report granular progress should report 0 until done. */
  progress: z.number().min(0).max(1).default(0),
  /** Present once status is "completed". */
  outputUrl: z.string().min(1).nullable().default(null),
  /** Present once status is "failed". Written for a user, not a log. */
  error: z.string().nullable().default(null),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type RenderJob = z.infer<typeof renderJobSchema>;

/** Terminal jobs stop being polled. */
export function isTerminalStatus(status: RenderJobStatus): boolean {
  return status === "completed" || status === "failed";
}

/** One line of status for the progress screen. */
export function describeRenderJob(job: RenderJob): string {
  switch (job.status) {
    case "queued":
      return "Waiting for a render slot…";
    case "rendering":
      return job.progress > 0
        ? `Rendering — ${Math.round(job.progress * 100)}%`
        : "Rendering your video…";
    case "completed":
      return "Done";
    case "failed":
      return job.error ?? "The render failed.";
  }
}

// --- Preflight ------------------------------------------------------------------------

/**
 * Every asset id a project actually uses.
 *
 * Shared by the upload preflight and the render service's "what am I still waiting for"
 * check — if those two ever disagreed, a job would either upload too much or wait forever
 * for a file nobody needs.
 */
export function referencedAssetIds(project: Project): Set<string> {
  const ids = new Set<string>();

  if (project.soundtrack.assetId) ids.add(project.soundtrack.assetId);

  for (const segment of project.segments) {
    if (segment.visual.main?.assetId) ids.add(segment.visual.main.assetId);
    if (segment.audio.vo) ids.add(segment.audio.vo.assetId);
    for (const overlay of segment.visual.overlays) {
      if (overlay.assetId) ids.add(overlay.assetId);
    }
  }

  return ids;
}

export type RenderBlocker =
  | { kind: "no-segments"; message: string }
  | { kind: "missing-visual"; message: string; segmentIndex: number }
  | { kind: "too-long"; message: string }
  | { kind: "too-large"; message: string };

export type RenderPreflight = {
  /** Hard stops. Rendering is refused while any of these are present. */
  blockers: RenderBlocker[];
  /** Worth saying, but not worth refusing over. */
  warnings: string[];
  durationMs: number;
  uploadBytes: number;
};

/**
 * Checks a project can be rendered before anything is uploaded.
 *
 * Failing here costs the user nothing; failing after a 100MB upload over cellular costs
 * them time, data, and trust.
 */
export function preflightRender(
  project: Project,
  assetSizeBytes: Record<string, number> = {},
): RenderPreflight {
  const blockers: RenderBlocker[] = [];
  const warnings: string[] = [];

  const durationMs = resolveProjectDurationMs(project);

  if (project.segments.length === 0) {
    blockers.push({ kind: "no-segments", message: "This project has no shots yet." });
  }

  for (const [index, segment] of project.segments.entries()) {
    if (segment.visual.main === null) {
      blockers.push({
        kind: "missing-visual",
        segmentIndex: index,
        message: `Shot ${index + 1} still needs a visual.`,
      });
    }
  }

  if (durationMs > HARD_MAX_PROJECT_DURATION_MS) {
    blockers.push({
      kind: "too-long",
      message: `This project is longer than the ${Math.round(
        HARD_MAX_PROJECT_DURATION_MS / 1000,
      )} second limit.`,
    });
  } else if (durationMs > SOFT_MAX_PROJECT_DURATION_MS) {
    warnings.push("Videos over 90 seconds take noticeably longer to render.");
  }

  // Only assets the project actually references count toward the upload.
  const byId = assetsById(project.assets);
  const referenced = referencedAssetIds(project);

  let uploadBytes = 0;
  for (const assetId of referenced) {
    if (byId.has(assetId)) uploadBytes += assetSizeBytes[assetId] ?? 0;
  }

  if (uploadBytes > MAX_RENDER_UPLOAD_BYTES) {
    blockers.push({
      kind: "too-large",
      message: `This project's media is ${Math.round(
        uploadBytes / 1024 / 1024,
      )}MB, over the ${Math.round(MAX_RENDER_UPLOAD_BYTES / 1024 / 1024)}MB limit.`,
    });
  }

  return { blockers, warnings, durationMs, uploadBytes };
}

/**
 * What an engine is handed. Assets are referenced by id; how their bytes reach the engine
 * is the engine's business — uploaded for a server, read from disk for a native renderer.
 */
export type RenderRequest = {
  project: Project;
  /** assetId -> absolute local URI. */
  assetUris: Record<string, string>;
};

/** Every render engine implements this. See §7B on why it is engine-agnostic. */
export type RenderEngine = {
  readonly name: string;
  /** Uploads or prepares whatever is needed and returns a job to poll. */
  start: (
    request: RenderRequest,
    onUploadProgress?: (fraction: number) => void,
  ) => Promise<RenderJob>;
  /** Current state of a job. */
  poll: (jobId: string) => Promise<RenderJob>;
  /** Downloads the finished video to a local file and returns its URI. */
  fetchOutput: (job: RenderJob) => Promise<string>;
  /** Best-effort cancellation. */
  cancel?: (jobId: string) => Promise<void>;
};
