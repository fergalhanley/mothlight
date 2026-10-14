import { extname } from "node:path";
import { requireValue } from "./auth";

type R = Record<string, any>;
// BytePlus ModelArk catalogue, checked 2026-10-14. Account activation is separate.
export const seedanceModels = [
  { id: "dreamina-seedance-2-5-260628", name: "Seedance 2.5", minDuration: 4, maxDuration: 30, references: 30, lastFrame: true, audio: true },
  { id: "dreamina-seedance-2-0-260128", name: "Seedance 2.0", minDuration: 4, maxDuration: 15, references: 9, lastFrame: true, audio: true },
  { id: "dreamina-seedance-2-0-fast-260128", name: "Seedance 2.0 Fast", minDuration: 4, maxDuration: 15, references: 9, lastFrame: true, audio: true },
  { id: "dreamina-seedance-2-0-mini-260615", name: "Seedance 2.0 Mini", minDuration: 4, maxDuration: 15, references: 9, lastFrame: true, audio: true },
  { id: "seedance-1-0-pro-250528", name: "Seedance 1.0 Pro", minDuration: 2, maxDuration: 12, references: 0, lastFrame: true, audio: false },
  { id: "seedance-1-0-pro-fast-251015", name: "Seedance 1.0 Pro Fast", minDuration: 2, maxDuration: 12, references: 0, lastFrame: false, audio: false },
];
export const seedanceConfigured = () => !!process.env.BYTEPLUS_MODELARK_API_KEY?.trim();
export function availableSeedanceModels() {
  const enabled = process.env.MOTHLIGHT_SEEDANCE_MODELS?.split(",").map(s => s.trim()).filter(Boolean);
  return enabled?.length ? seedanceModels.filter(m => enabled.includes(m.id)) : seedanceModels;
}
export function seedanceOptions(modelId: string, options: R, input: R) {
  const model = availableSeedanceModels().find(m => m.id === modelId);
  requireValue(model, "Choose a supported Seedance model.");
  const duration = Number(options.duration ?? input.shot.duration);
  requireValue(Number.isInteger(duration) && duration >= model!.minDuration && duration <= model!.maxDuration,
    `${model!.name} requires a whole-second duration of ${model!.minDuration}–${model!.maxDuration} seconds.`);
  const mode = options.mode || "text";
  requireValue(["text", "frames", "references"].includes(mode), "Choose a valid image input mode.");
  if (mode === "frames") {
    requireValue(input.firstFrame, "Add a storyboard image to use first/last frames.");
    requireValue(!input.lastFrame || model!.lastFrame, "This model does not support a last frame.");
  }
  if (mode === "references") {
    const count = referenceImages(input).length;
    requireValue(model!.references > 0, "This model does not support World reference images.");
    requireValue(count > 0 && count <= model!.references, `Link between 1 and ${model!.references} World reference images to this shot.`);
  }
  const ratio = options.ratio || "adaptive";
  requireValue(["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(ratio), "Choose a supported aspect ratio.");
  requireValue(!(modelId === seedanceModels[0].id && mode === "frames" && ratio !== "adaptive"), "Seedance 2.5 frame inputs require the adaptive aspect ratio.");
  const resolution = options.resolution || "720p";
  requireValue(["480p", "720p"].includes(resolution), "Choose 480p or 720p.");
  const audio = options.audio === true || options.audio === "true";
  requireValue(!audio || model!.audio, "This model does not generate audio.");
  return { duration, mode, ratio, resolution, audio };
}
function referenceImages(input: R): { path: string; label: string }[] {
  const images: { path: string; label: string }[] = [];
  for (const asset of input.assets || []) {
    for (const ref of asset.attachments || []) {
      if (ref.mime?.startsWith("image/") && ref.mime !== "image/svg+xml")
        images.push({ path: ref.localPath, label: `${asset.name}: ${ref.label || ref.filename}` });
    }
    if (asset.referencePath) images.push({ path: asset.referencePath, label: asset.name });
  }
  return images.filter((r, i) => images.findIndex(other => other.path === r.path) === i);
}
export async function seedancePayload(model: string, prompt: string, input: R) {
  const options = seedanceOptions(model, input.seedance || {}, input);
  const context = [prompt, input.project?.style && `Visual style: ${input.project.style}`,
    ...["camera", "dialogue", "continuity", "negative_prompt"].map(key => input.shot[key] && `${key}: ${input.shot[key]}`),
    ...(input.assets || []).map((a: R) => `${a.name}: ${[a.description, a.prompt, a.continuity].filter(Boolean).join("\n")}`),
  ].filter(Boolean).join("\n\n");
  const content: R[] = [{ type: "text", text: context }];
  const images = options.mode === "frames"
    ? [{ path: input.firstFrame, role: "first_frame" }, ...(input.lastFrame ? [{ path: input.lastFrame, role: "last_frame" }] : [])]
    : options.mode === "references" ? referenceImages(input).map((r, i) => {
      content[0].text += `\n@Image${i + 1}: ${r.label}`;
      return { path: r.path, role: "reference_image" };
    }) : [];
  let total = 0;
  for (const image of images) {
    const mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp", ".tiff": "image/tiff" } as R)[extname(image.path).toLowerCase()];
    requireValue(mime, "Seedance image references must be PNG, JPEG, WebP, GIF, BMP or TIFF.");
    const file = Bun.file(image.path);
    requireValue(await file.exists() && file.size > 0 && file.size < 30 * 1024 * 1024, "Seedance reference image is missing, empty or exceeds 30 MB.");
    total += Math.ceil(file.size / 3) * 4;
    requireValue(total < 60 * 1024 * 1024, "Reference images are too large to send together. Use smaller images.");
    content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}` }, role: image.role });
  }
  return { model, content, duration: options.duration, ratio: options.ratio, resolution: options.resolution,
    ...(seedanceModels.find(m => m.id === model)!.audio ? { generate_audio: options.audio } : {}) };
}

const endpoint = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";
export async function generateSeedance(model: string, prompt: string, input: R, saveTask: (task: R) => void,
  dependencies: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; timeoutMs?: number } = {}) {
  const key = process.env.BYTEPLUS_MODELARK_API_KEY?.trim();
  requireValue(key, "Set BYTEPLUS_MODELARK_API_KEY in .env and restart Mothlight.");
  const request = dependencies.fetch || fetch;
  const sleep = dependencies.sleep || (ms => Bun.sleep(ms));
  const api = async (path: string, payload?: R) => {
    let response: Response;
    try {
      response = await request(endpoint + path, {
        method: payload ? "POST" : "GET", redirect: "error",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new Error("BytePlus connection failed. Check the BytePlus task history before submitting again.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(data.error?.message || `HTTP ${response.status}`).replaceAll(key!, "[redacted]").slice(0, 600);
      throw new Error(`BytePlus: ${message}`);
    }
    return data;
  };
  const payload = await seedancePayload(model, prompt, input);
  const created = await api("", payload);
  requireValue(typeof created.id === "string" && /^[\w-]+$/.test(created.id), "BytePlus returned no valid task ID. Check its task history before retrying.");
  const taskId = created.id;
  saveTask({ id: taskId, status: "queued" });
  try {
    const deadline = Date.now() + (dependencies.timeoutMs ?? 30 * 60_000);
    while (Date.now() < deadline) {
      const task = await api(`/${encodeURIComponent(taskId)}`);
      saveTask({ id: taskId, status: task.status, usage: task.usage });
      if (task.status === "succeeded") {
        const output = new URL(task.content?.video_url);
        requireValue(output.protocol === "https:", "BytePlus returned an invalid video URL.");
        const response = await request(output, { signal: AbortSignal.timeout(120_000) });
        requireValue(response.ok && response.body, "Could not download the generated BytePlus video.");
        const reader = response.body!.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            requireValue(size <= 500 * 1024 * 1024, "BytePlus video exceeds the 500 MB media limit.");
            chunks.push(value);
          }
        } finally { await reader.cancel(); }
        requireValue(size > 0, "BytePlus returned an empty video.");
        return new Blob([Buffer.concat(chunks)], { type: "video/mp4" });
      }
      if (["failed", "expired", "cancelled"].includes(task.status))
        throw new Error(String(task.error?.message || `Generation ${task.status}`).replaceAll(key!, "[redacted]").slice(0, 600));
      requireValue(["queued", "running"].includes(task.status), "BytePlus returned an unknown task status.");
      await sleep(3000);
    }
    throw new Error("Still pending after 30 minutes. Check BytePlus before submitting again.");
  } catch (error) {
    throw new Error(`BytePlus task ${taskId}: ${(error as Error).message}`);
  }
}
