import { join } from "node:path";
import { mkdir, rm, copyFile } from "node:fs/promises";
import { all, one, run, id, dataDir, type Row } from "./db";
import { projectShots, frameCount } from "./export";
import { requireValue } from "./auth";
import { generateSeedance } from "./seedance";
import { generateImage } from "./images";
export const mediaPath = (m: Row) => join(dataDir, "media", m.stored_name);
let busy = false;
export async function execProcess(
  args: string[],
  options: { cwd?: string; stdin?: string } = {},
) {
  const p = Bun.spawn(args, {
    cwd: options.cwd,
    stdin: options.stdin ? new TextEncoder().encode(options.stdin) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => p.kill(), 30 * 60 * 1000);
  const [out, err, exit] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  clearTimeout(timer);
  if (exit !== 0) throw new Error(err.slice(-3000) || `Process exited ${exit}`);
  return out;
}
export async function storeMedia(
  profileId: string,
  bytes: Blob | Uint8Array,
  filename: string,
  mime: string,
) {
  const mid = id();
  const ext =
    (
      {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
      } as Record<string, string>
    )[mime] || ".bin";
  const stored = mid + ext;
  await Bun.write(join(dataDir, "media", stored), bytes);
  run(
    "INSERT INTO media(id,profile_id,filename,stored_name,mime,size) VALUES(?,?,?,?,?,?)",
    mid,
    profileId,
    filename,
    stored,
    mime,
    bytes instanceof Blob ? bytes.size : bytes.byteLength,
  );
  return one("SELECT * FROM media WHERE id=?", mid)!;
}
async function renderCut(job: Row) {
  const snapshots = JSON.parse(job.input_json);
  const project = snapshots.project;
  const shots: Row[] = snapshots.shots;
  const cues: Row[] = snapshots.audio;
  const temp = join(dataDir, "work", job.id);
  await mkdir(temp, { recursive: true });
  try {
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i],
        m = one("SELECT * FROM media WHERE id=?", shot.media_id)!;
      const frames = frameCount(shot.duration, project.fps);
      await execProcess([
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-ss",
        String(shot.trim_in),
        "-i",
        mediaPath(m),
        "-an",
        "-vf",
        `scale=${project.width}:${project.height}:force_original_aspect_ratio=decrease,pad=${project.width}:${project.height}:(ow-iw)/2:(oh-ih)/2,fps=${project.fps},tpad=stop_mode=clone:stop_duration=600`,
        "-frames:v",
        String(frames),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        join(temp, `${i}.mp4`),
      ]);
    }
    await Bun.write(
      join(temp, "list.txt"),
      shots.map((_, i) => `file '${i}.mp4'`).join("\n"),
    );
    const output = join(temp, "cut.mp4");
    const total = shots.reduce(
      (n, s) => n + frameCount(s.duration, project.fps) / project.fps,
      0,
    );
    const args = [
      "ffmpeg",
      "-y",
      "-v",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      join(temp, "list.txt"),
    ];
    for (const cue of cues)
      args.push(
        "-i",
        mediaPath(one("SELECT * FROM media WHERE id=?", cue.media_id)!),
      );
    if (cues.length) {
      const filters = cues.map(
        (c, i) =>
          `[${i + 1}:a]atrim=start=${c.trim_in}:duration=${c.duration},asetpts=PTS-STARTPTS,volume=${c.volume},adelay=${Math.round(c.offset * 1000)}:all=1[a${i}]`,
      );
      filters.push(
        `${cues.map((_, i) => `[a${i}]`).join("")}amix=inputs=${cues.length}:normalize=0,apad,atrim=duration=${total}[mix]`,
      );
      args.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "0:v",
        "-map",
        "[mix]",
        "-c:a",
        "aac",
      );
    }
    args.push(
      "-c:v",
      "copy",
      "-t",
      String(total),
      "-movflags",
      "+faststart",
      output,
    );
    await execProcess(args);
    return {
      media: await storeMedia(
        job.profile_id,
        Bun.file(output),
        `${project.title}-roughcut.mp4`,
        "video/mp4",
      ),
      cost: 0,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
async function generate(job: Row) {
  const input = JSON.parse(job.input_json);
  if (job.kind === "image" && input.frameTarget === "endframe") {
    if (input.dependsOnJobId) {
      const dependency = one("SELECT status FROM jobs WHERE id=? AND shot_id=?", input.dependsOnJobId, job.shot_id);
      requireValue(dependency?.status === "succeeded", "Storyboard generation failed or was cancelled; generate the storyboard before the end frame.");
    }
    // Resolve the storyboard at execution time so "both" uses the newly generated opening frame.
    const shot = one("SELECT storyboard_id FROM shots WHERE id=?", job.shot_id);
    input.firstFrame = shot?.storyboard_id
      ? mediaPath(one("SELECT * FROM media WHERE id=?", shot.storyboard_id)!)
      : null;
    run("UPDATE jobs SET input_json=? WHERE id=?", JSON.stringify(input), job.id);
  }
  if (job.kind === "image" && (job.provider === "openai" || job.provider === "google")) {
    const result = await generateImage(job.provider, job.model, job.prompt, input);
    const extension = result.mime === "image/jpeg" ? "jpg" : result.mime === "image/webp" ? "webp" : "png";
    const media = await storeMedia(job.profile_id, result.bytes, `frame-${job.id}.${extension}`, result.mime);
    // Image API pricing is account-based; do not invent a charge without billing data.
    return { media, cost: 0 };
  }
  if (job.provider === "byteplus") {
    const video = await generateSeedance(job.model, job.prompt, input, (task) => {
      input.byteplusTask = task;
      run("UPDATE jobs SET input_json=? WHERE id=?", JSON.stringify(input), job.id);
    });
    const media = await storeMedia(job.profile_id, video, `seedance-${job.id}.mp4`, "video/mp4");
    // ModelArk returns token usage, not the account's final billed USD amount.
    return { media, cost: 0 };
  }
  const adapter = process.env.MOTHLIGHT_GENERATOR;
  requireValue(
    adapter,
    "No generator adapter configured. Import media from your preferred tool or configure MOTHLIGHT_GENERATOR.",
  );
  const work = join(dataDir, "work", job.id);
  await mkdir(work, { recursive: true });
  try {
    // Adapter input/output contract is intentionally provider-neutral. No shell interpolation.
    const adapterInput = {
      ...input,
      jobId: job.id,
      kind: job.kind,
      provider: job.provider,
      model: job.model,
      prompt: job.prompt,
      outputDirectory: work,
    };
    const raw = await execProcess([adapter], { stdin: JSON.stringify(adapterInput) });
    const result = JSON.parse(raw);
    requireValue(
      typeof result.outputPath === "string" &&
        Number.isFinite(result.cost) &&
        result.cost >= 0,
      "Adapter returned invalid output.",
    );
    const file = Bun.file(result.outputPath);
    requireValue(
      (await file.exists()) && file.size > 0 && file.size <= 500 * 1024 * 1024,
      "Adapter output missing or too large.",
    );
    const mime = job.kind === "image" ? "image/png" : "video/mp4";
    const media = await storeMedia(
      job.profile_id,
      file,
      `${job.kind}-${job.id}${job.kind === "image" ? ".png" : ".mp4"}`,
      mime,
    );
    return { media, cost: result.cost as number };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
export async function tick() {
  if (busy) return;
  busy = true;
  try {
    const job = one(
      "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at,rowid LIMIT 1",
    );
    if (!job) return;
    run("UPDATE jobs SET status='running' WHERE id=?", job.id);
    try {
      const { media, cost } =
        job.kind === "roughcut" ? await renderCut(job) : await generate(job);
      const v2TakeId: string | undefined = JSON.parse(job.input_json).v2TakeId;
      if (job.kind === "video" && v2TakeId) {
        run("UPDATE v2_takes SET media_id=?,status='completed' WHERE id=? AND job_id=?",media.id,v2TakeId,job.id);
      } else if (job.kind === "video")
        run(
          "INSERT INTO takes(id,shot_id,media_id,label,provider,model,prompt,cost) VALUES(?,?,?,?,?,?,?,?)",
          id(),
          job.shot_id,
          media.id,
          "Generated take",
          job.provider,
          job.model,
          job.prompt,
          cost,
        );
      if (job.kind === "image" && v2TakeId) {
        const old = one("SELECT reference_ids_json FROM v2_takes WHERE id=?",v2TakeId);
        if (old) run("UPDATE v2_takes SET reference_ids_json=? WHERE id=?",
          JSON.stringify([...JSON.parse(old.reference_ids_json),media.id]),v2TakeId);
      } else if (job.kind === "image") {
        const target = JSON.parse(job.input_json).frameTarget || "storyboard";
        if (target === "endframe")
          run("UPDATE shots SET end_frame_id=? WHERE id=?", media.id, job.shot_id);
        else
          run(
            "UPDATE shots SET storyboard_id=?,status=CASE WHEN status='planned' THEN 'storyboard' ELSE status END WHERE id=?",
            media.id, job.shot_id,
          );
      }
      run(
        "UPDATE jobs SET status='succeeded',output_media_id=?,cost=? WHERE id=?",
        media.id,
        cost,
        job.id,
      );
    } catch (e) {
      const failedV2: string | undefined = JSON.parse(job.input_json).v2TakeId;
      if (failedV2 && job.kind === "video")
        run("UPDATE v2_takes SET status='failed' WHERE id=? AND job_id=?",failedV2,job.id);
      run(
        "UPDATE jobs SET status='failed',error=? WHERE id=?",
        (e as Error).message,
        job.id,
      );
    }
  } finally {
    busy = false;
  }
}
export function startWorker() {
  run(
    "UPDATE jobs SET status='failed',error='Server restarted during execution. Review the provider before submitting another attempt.' WHERE status='running'",
  );
  run("UPDATE v2_takes SET status='failed' WHERE status='queued' AND job_id IN (SELECT id FROM jobs WHERE status IN ('failed','cancelled'))");
  const timer = setInterval(() => void tick(), 1000);
  return () => clearInterval(timer);
}
