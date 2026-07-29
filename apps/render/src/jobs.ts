import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createId, type Project, type RenderJob, referencedAssetIds } from "@mothlight/core";
import { renderProjectToFile } from "./render";

/**
 * An in-process job queue.
 *
 * Deliberately not Redis or a broker. Decision 7 puts this on a single container, one job
 * runs at a time because a render saturates the CPU anyway, and a queue that lives in the
 * same process as the worker cannot disagree with it. If this ever needs to scale past
 * one box, this module is the seam — the HTTP surface would not change.
 */

const MAX_CONCURRENT_RENDERS = 1;

/** Finished jobs are swept so a long-running container does not fill its disk. */
const JOB_TTL_MS = 60 * 60 * 1000;

export type JobRecord = RenderJob & {
  project: Project;
  workspace: string;
  outputPath: string | null;
  /** assetId -> absolute path of an upload we have received. */
  receivedAssets: Record<string, string>;
  /** Ids the project references; a job cannot start until all are present. */
  requiredAssets: string[];
  started: boolean;
};

const jobs = new Map<string, JobRecord>();
const queue: string[] = [];
let running = 0;

function now(): string {
  return new Date().toISOString();
}

export function createJob(project: Project, workspaceRoot: string): JobRecord {
  const id = createId("job");
  const workspace = path.join(workspaceRoot, id);
  mkdirSync(path.join(workspace, "assets"), { recursive: true });

  const record: JobRecord = {
    id,
    status: "queued",
    progress: 0,
    outputUrl: null,
    error: null,
    createdAt: now(),
    updatedAt: now(),
    project,
    workspace,
    outputPath: null,
    receivedAssets: {},
    requiredAssets: [...referencedAssetIds(project)],
    started: false,
  };

  jobs.set(id, record);
  return record;
}

export function getJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

/** What the client still has to upload before the job can run. */
export function missingAssets(job: JobRecord): string[] {
  return job.requiredAssets.filter((assetId) => !job.receivedAssets[assetId]);
}

export function recordAsset(job: JobRecord, assetId: string, filePath: string): void {
  job.receivedAssets[assetId] = filePath;
  job.updatedAt = now();
}

/** The public shape — everything internal stays on the server. */
export function toPublicJob(job: JobRecord, publicBaseUrl: string): RenderJob {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    outputUrl: job.status === "completed" ? `${publicBaseUrl}/render/${job.id}/output` : null,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export function enqueue(job: JobRecord): { ok: true } | { ok: false; error: string } {
  if (job.started) return { ok: true };

  const missing = missingAssets(job);
  if (missing.length > 0) {
    return { ok: false, error: `Still waiting on ${missing.length} file(s).` };
  }

  job.started = true;
  job.status = "queued";
  job.updatedAt = now();
  queue.push(job.id);
  void drain();

  return { ok: true };
}

async function drain(): Promise<void> {
  if (running >= MAX_CONCURRENT_RENDERS) return;

  const id = queue.shift();
  if (!id) return;

  const job = jobs.get(id);
  if (!job) return void drain();

  running++;
  job.status = "rendering";
  job.progress = 0;
  job.updatedAt = now();

  const outputPath = path.join(job.workspace, "output.mp4");

  try {
    await renderProjectToFile({
      project: job.project,
      assetPaths: job.receivedAssets,
      outputPath,
      onProgress: (fraction) => {
        job.progress = Math.min(1, Math.max(0, fraction));
        job.updatedAt = now();
      },
    });

    job.outputPath = outputPath;
    job.status = "completed";
    job.progress = 1;
  } catch (cause) {
    job.status = "failed";
    // The user sees this, so keep it short and free of stack traces.
    job.error = cause instanceof Error ? `Rendering failed: ${cause.message}` : "Rendering failed.";
    console.error(`[job ${job.id}] render failed:`, cause);
  } finally {
    job.updatedAt = now();
    running--;
    void drain();
  }
}

/** Removes finished jobs and their workspaces once they are past the TTL. */
export function sweepExpiredJobs(): number {
  const cutoff = Date.now() - JOB_TTL_MS;
  let removed = 0;

  for (const [id, job] of jobs) {
    const isFinished = job.status === "completed" || job.status === "failed";
    if (!isFinished || new Date(job.updatedAt).getTime() > cutoff) continue;

    try {
      rmSync(job.workspace, { recursive: true, force: true });
    } catch {
      // A workspace we cannot remove is not worth crashing the sweep over.
    }
    jobs.delete(id);
    removed++;
  }

  return removed;
}

/** Test seam. */
export function _resetJobs(): void {
  jobs.clear();
  queue.length = 0;
  running = 0;
}
