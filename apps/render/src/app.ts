import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { MAX_RENDER_UPLOAD_BYTES, parseProject } from "@mothlight/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./env";
import { createJob, enqueue, getJob, missingAssets, recordAsset, toPublicJob } from "./jobs";

/**
 * The render service's HTTP surface.
 *
 * Uploads arrive one asset at a time so a dropped connection loses one file rather than
 * the whole project, and so `missingAssets` can tell a retrying client exactly what is
 * still needed.
 */

/** Asset ids come from a client, so they must never be trusted as path segments. */
function isSafeAssetId(assetId: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(assetId) && !assetId.includes("..");
}

export function createApp(env: Env) {
  const app = new Hono();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: env.CORS_ALLOWED_ORIGINS,
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok", service: "Mothlight render" }));

  // --- Create a job -------------------------------------------------------------------
  app.post("/render", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Expected a JSON body." }, 400);
    }

    const { project: rawProject } = (body ?? {}) as { project?: unknown };
    const parsed = parseProject(rawProject);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const job = createJob(parsed.project, env.WORKSPACE_DIR);
    return c.json({ jobId: job.id, missingAssets: missingAssets(job) }, 201);
  });

  // --- Upload one asset ---------------------------------------------------------------
  app.put("/render/:jobId/assets/:assetId", async (c) => {
    const { jobId, assetId } = c.req.param();

    const job = getJob(jobId);
    if (!job) return c.json({ error: "Unknown render job." }, 404);
    if (job.started) return c.json({ error: "That render has already started." }, 409);
    if (!isSafeAssetId(assetId)) return c.json({ error: "Invalid asset id." }, 400);
    if (!job.requiredAssets.includes(assetId)) {
      return c.json({ error: "That asset is not used by this project." }, 400);
    }

    const declared = Number(c.req.header("Content-Length") ?? 0);
    if (declared > MAX_RENDER_UPLOAD_BYTES) {
      return c.json({ error: "That file is too large." }, 413);
    }

    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength > MAX_RENDER_UPLOAD_BYTES) {
      return c.json({ error: "That file is too large." }, 413);
    }

    const destination = path.join(job.workspace, "assets", assetId);
    writeFileSync(destination, bytes);
    recordAsset(job, assetId, destination);

    return c.json({ received: assetId, missingAssets: missingAssets(job) });
  });

  // --- Start --------------------------------------------------------------------------
  app.post("/render/:jobId/start", (c) => {
    const job = getJob(c.req.param("jobId"));
    if (!job) return c.json({ error: "Unknown render job." }, 404);

    const result = enqueue(job);
    if (!result.ok) return c.json({ error: result.error }, 409);

    return c.json(toPublicJob(job, env.PUBLIC_BASE_URL));
  });

  // --- Poll ---------------------------------------------------------------------------
  app.get("/render/:jobId", (c) => {
    const job = getJob(c.req.param("jobId"));
    if (!job) return c.json({ error: "Unknown render job." }, 404);
    return c.json(toPublicJob(job, env.PUBLIC_BASE_URL));
  });

  // --- Download -----------------------------------------------------------------------
  app.get("/render/:jobId/output", (c) => {
    const job = getJob(c.req.param("jobId"));
    if (!job?.outputPath || !existsSync(job.outputPath)) {
      return c.json({ error: "That video is no longer available." }, 404);
    }

    const { size } = statSync(job.outputPath);
    // Streamed rather than buffered: a 60-second render is tens of megabytes.
    const stream = Readable.toWeb(createReadStream(job.outputPath)) as ReadableStream;

    return new Response(stream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="mothlight-${job.id}.mp4"`,
      },
    });
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((err, c) => {
    console.error("Unhandled render service error:", err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
