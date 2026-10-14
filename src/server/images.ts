import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { requireValue } from "./auth";
import type { Row } from "./db";

export const IMAGE_MODELS = {
  openai: [
    { id: "gpt-image-1.5", name: "GPT Image 1.5" },
    { id: "gpt-image-1-mini", name: "GPT Image 1 Mini · economical" },
    { id: "gpt-image-2", name: "GPT Image 2" },
  ],
  google: [
    { id: "gemini-nano-banana-2.1", name: "Nano Banana 2.1" },
    { id: "gemini-2.5-flash-image", name: "Nano Banana · 2.5 Flash" },
    { id: "gemini-3-pro-image", name: "Nano Banana Pro" },
  ],
} as const;

export function imageConfigured(provider: string) {
  return provider === "openai"
    ? !!process.env.OPENAI_API_KEY
    : provider === "google"
      ? !!process.env.GEMINI_API_KEY
      : provider === "custom"
        ? !!process.env.MOTHLIGHT_GENERATOR
        : false;
}

function mime(path: string) {
  const ext = extname(path).toLowerCase();
  return ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : null;
}

type RefImage = { path: string; mime: string; bytes: Uint8Array };

async function referenceImages(input: Row, target: string, model: string): Promise<RefImage[]> {
  const paths: string[] = [];
  if (target === "endframe" && input.firstFrame) paths.push(input.firstFrame);
  if (target === "storyboard" && input.firstFrame) paths.push(input.firstFrame);
  const maxImages = model === "gemini-2.5-flash-image" ? 3 : 8;
  for (const a of input.assets || []) {
    if (a.referencePath) paths.push(a.referencePath);
    for (const attachment of a.attachments || []) if (attachment.localPath) paths.push(attachment.localPath);
  }
  const refs: RefImage[] = [];
  for (const path of [...new Set(paths)]) {
    if (refs.length >= maxImages) break;
    const mediaType = mime(path);
    if (!mediaType) continue;
    const file = await stat(path);
    // Avoid oversized requests and sending non-image attachments to third-party models.
    if (file.size <= 0 || file.size > 12 * 1024 * 1024) continue;
    refs.push({ path, mime: mediaType, bytes: new Uint8Array(await readFile(path)) });
  }
  return refs;
}

function outputRatio(width: number, height: number) {
  const r = width / height;
  return r > 1.45 ? "16:9" : r < 0.7 ? "9:16" : r > 1.1 ? "4:3" : r < 0.9 ? "3:4" : "1:1";
}

function promptForFrame(prompt: string, input: Row, target: string, count: number) {
  const sh = input.shot;
  const project = input.project;
  return [
    "Create one polished production-ready cinematic still image, not a collage, contact sheet, illustration of a film set, or text description.",
    target === "endframe"
      ? "This is the END frame of the shot. Depict the final moment after the stated action. Preserve identity, setting, lighting and costume from the first-frame reference when supplied."
      : "This is the START / storyboard frame of the shot. Depict the opening instant before the stated action unfolds.",
    "Keep the same aspect ratio and visual style as the project. Do not add captions, logos or borders.",
    `Project visual direction: ${project.style || "(not specified)"}`,
    `Shot: ${sh.title}. Action: ${sh.action || "(not specified)"}`,
    `Camera/framing: ${sh.camera || "(not specified)"}`,
    `Character dialogue/context: ${sh.dialogue || "(none)"}`,
    `Continuity: ${sh.continuity || "(not specified)"}`,
    sh.negative_prompt ? `Avoid: ${sh.negative_prompt}` : "",
    `Creative instructions: ${prompt}`,
    ...(input.assets || []).map((a: Row) => `Reference ${a.kind} ${a.name}: ${a.description || ""}. ${a.prompt || ""}. Continuity: ${a.continuity || ""}`),
    count ? "The attached images are continuity references. Preserve recognizable faces, outfits, locations and established art direction rather than copying their composition indiscriminately." : "",
  ].filter(Boolean).join("\n");
}

async function requestError(response: Response) {
  const body = await response.text();
  let message = body.slice(0, 500);
  try { message = JSON.parse(body).error?.message || message; } catch { /* non-JSON provider error */ }
  throw new Error(`Image provider request failed (${response.status}): ${message}`);
}

export async function generateImage(provider: string, model: string, userPrompt: string, input: Row): Promise<{ bytes: Uint8Array; mime: string }> {
  const models = IMAGE_MODELS[provider as keyof typeof IMAGE_MODELS];
  requireValue(models && models.some(m => m.id === model), "Unsupported image model.");
  requireValue(imageConfigured(provider), "Configure the image provider API key in Mothlight settings.");
  const target = input.frameTarget;
  requireValue(target === "storyboard" || target === "endframe", "Choose a frame target.");
  const references = await referenceImages(input, target, model);
  const prompt = promptForFrame(userPrompt, input, target, references.length);
  const ratio = outputRatio(Number(input.project.width) || 1920, Number(input.project.height) || 1080);

  if (provider === "openai") {
    const size = ratio === "16:9" || ratio === "4:3" ? "1536x1024" : ratio === "9:16" || ratio === "3:4" ? "1024x1536" : "1024x1024";
    const headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
    let response: Response;
    if (references.length) {
      const body = new FormData();
      body.set("model", model);
      body.set("prompt", prompt);
      body.set("size", size);
      body.set("quality", "medium");
      body.set("output_format", "png");
      for (const ref of references) {
        body.append("image[]", new File([ref.bytes], ref.path.split("/").pop() || "reference.png", { type: ref.mime }));
      }
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers, body, signal: AbortSignal.timeout(20 * 60_000) });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, size, quality: "medium", output_format: "png" }),
        signal: AbortSignal.timeout(20 * 60_000),
      });
    }
    if (!response.ok) await requestError(response);
    const result = await response.json() as Row;
    const encoded = result.data?.[0]?.b64_json;
    requireValue(typeof encoded === "string" && encoded.length, "OpenAI returned no image.");
    return { bytes: new Uint8Array(Buffer.from(encoded, "base64")), mime: "image/png" };
  }

  const parts: Row[] = [{ text: prompt }];
  for (const ref of references) parts.push({ inline_data: { mime_type: ref.mime, data: Buffer.from(ref.bytes).toString("base64") } });
  const imageConfig: Row = { aspectRatio: ratio };
  if (model !== "gemini-2.5-flash-image") imageConfig.imageSize = "2K";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig } }),
    signal: AbortSignal.timeout(20 * 60_000),
  });
  if (!response.ok) await requestError(response);
  const result = await response.json() as Row;
  const output = result.candidates?.[0]?.content?.parts?.find((p: Row) => p.inlineData || p.inline_data);
  const image = output?.inlineData || output?.inline_data;
  requireValue(image?.data && ["image/png", "image/jpeg", "image/webp"].includes(image.mimeType || image.mime_type), "Gemini returned no supported image.");
  return { bytes: new Uint8Array(Buffer.from(image.data, "base64")), mime: image.mimeType || image.mime_type };
}
