import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateImage } from "../src/server/images";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
  "base64",
);

async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), "mothlight-images-"));
  const image = join(folder, "reference.png");
  await Bun.write(image, tinyPng);
  return { folder, image };
}
function jobInput(image: string) {
  return {
    frameTarget: "endframe",
    firstFrame: image,
    shot: { title: "Returns home", action: "Marisol opens the door", camera: "Wide shot", dialogue: "", negative_prompt: "", continuity: "Same outfit" },
    project: { width: 1920, height: 1080, style: "Muted cinematic blue" },
    assets: [{ name: "Marisol", kind: "character", description: "Short dark hair", prompt: "", continuity: "Blue jacket", referencePath: image, attachments: [] }],
  };
}

test("OpenAI still generation uses server-side authentication, edits and shot references", async () => {
  const { folder, image } = await fixture();
  const originalFetch = globalThis.fetch;
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-secret";
  try {
    let calls = 0;
    globalThis.fetch = (async (url: any, init: any) => {
      calls++;
      expect(String(url)).toBe("https://api.openai.com/v1/images/edits");
      expect(init.headers.Authorization).toBe("Bearer test-openai-secret");
      expect(init.body).toBeInstanceOf(FormData);
      expect(init.body.get("prompt")).toContain("END frame");
      expect(init.body.get("prompt")).toContain("Blue jacket");
      expect(init.body.getAll("image[]")).toHaveLength(1);
      return Response.json({ data: [{ b64_json: tinyPng.toString("base64") }] });
    }) as typeof fetch;
    const result = await generateImage("openai", "gpt-image-1-mini", "Return home", jobInput(image));
    expect(calls).toBe(1);
    expect(result.mime).toBe("image/png");
    expect(result.bytes.byteLength).toBe(tinyPng.byteLength);
  } finally {
    globalThis.fetch = originalFetch;
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
    await rm(folder, { recursive: true, force: true });
  }
});

test("Nano Banana still generation sends continuity images and honors project aspect ratio", async () => {
  const { folder, image } = await fixture();
  const originalFetch = globalThis.fetch;
  const original = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-secret";
  try {
    globalThis.fetch = (async (url: any, init: any) => {
      expect(String(url)).toContain("/gemini-nano-banana-2.1:generateContent");
      expect(init.headers["x-goog-api-key"]).toBe("test-gemini-secret");
      const data = JSON.parse(init.body);
      expect(data.contents[0].parts[0].text).toContain("END frame");
      expect(data.contents[0].parts.slice(1)).toHaveLength(1);
      expect(data.generationConfig.responseModalities).toEqual(["IMAGE"]);
      expect(data.generationConfig.imageConfig.aspectRatio).toBe("16:9");
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: tinyPng.toString("base64") } }] } }] });
    }) as typeof fetch;
    const result = await generateImage("google", "gemini-nano-banana-2.1", "Return home", jobInput(image));
    expect(result.mime).toBe("image/png");
    expect(result.bytes.byteLength).toBe(tinyPng.byteLength);
  } finally {
    globalThis.fetch = originalFetch;
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
    await rm(folder, { recursive: true, force: true });
  }
});
