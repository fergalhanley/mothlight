import {
  type RenderEngine,
  type RenderJob,
  type RenderRequest,
  renderJobSchema,
} from "@mothlight/core";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Path A from §7: upload the project and its media, let a Remotion worker render it,
 * download the result.
 *
 * The upload is one request per asset rather than a single archive. That avoids a zip
 * dependency, gives honest per-file progress on a slow connection, and means a failure
 * names the file that failed instead of "upload failed".
 */

const RENDER_DOWNLOAD_DIR = "renders";

function baseUrl(): string {
  const url = process.env.EXPO_PUBLIC_RENDER_API_URL;
  if (!url) {
    throw new Error("Rendering isn't configured on this build (EXPO_PUBLIC_RENDER_API_URL).");
  }
  return url.replace(/\/+$/, "");
}

/** Server errors are for users, so unwrap the message rather than showing a status code. */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.length > 0) return body.error;
  } catch {
    // Non-JSON error body.
  }
  return fallback;
}

function parseJob(raw: unknown): RenderJob {
  const result = renderJobSchema.safeParse(raw);
  if (!result.success) {
    throw new Error("The render service returned something unexpected.");
  }
  return result.data;
}

export const serverRenderEngine: RenderEngine = {
  name: "server-remotion",

  async start(request: RenderRequest, onUploadProgress) {
    const root = baseUrl();

    // 1. Register the job. The server replies with the assets it still needs, so a retry
    //    after a dropped connection does not re-upload what already landed.
    const created = await fetch(`${root}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: request.project }),
    });

    if (!created.ok) {
      throw new Error(await readError(created, "Could not start the render."));
    }

    const { jobId, missingAssets } = (await created.json()) as {
      jobId: string;
      missingAssets: string[];
    };

    // 2. Upload each asset the server asked for.
    const needed = missingAssets.filter((assetId) => request.assetUris[assetId]);
    for (const [index, assetId] of needed.entries()) {
      const uri = request.assetUris[assetId];
      if (!uri) continue;

      const file = new File(uri);
      if (!file.exists) {
        throw new Error(`A file this project uses is missing (${assetId}).`);
      }

      const result = await file.upload(`${root}/render/${jobId}/assets/${assetId}`, {
        httpMethod: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      if (result.status >= 400) {
        throw new Error(`Uploading ${file.name} failed.`);
      }

      onUploadProgress?.((index + 1) / needed.length);
    }

    // 3. Everything is in place; let it run.
    const started = await fetch(`${root}/render/${jobId}/start`, { method: "POST" });
    if (!started.ok) {
      throw new Error(await readError(started, "Could not start the render."));
    }

    return parseJob(await started.json());
  },

  async poll(jobId: string) {
    const response = await fetch(`${baseUrl()}/render/${jobId}`);
    if (!response.ok) {
      throw new Error(await readError(response, "Lost track of that render."));
    }
    return parseJob(await response.json());
  },

  async fetchOutput(job: RenderJob) {
    if (!job.outputUrl) throw new Error("That render has no output yet.");

    const directory = new Directory(Paths.cache, RENDER_DOWNLOAD_DIR);
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });

    const destination = new File(directory, `${job.id}.mp4`);
    if (destination.exists) destination.delete();

    const downloaded = await File.downloadFileAsync(job.outputUrl, destination);
    return downloaded.uri;
  },

  async cancel(jobId: string) {
    // Best effort — a server that has already finished is not an error worth surfacing.
    try {
      await fetch(`${baseUrl()}/render/${jobId}`, { method: "DELETE" });
    } catch {
      // Ignored by contract.
    }
  },
};
