import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createId, createUuid, parseProject } from "@mothlight/core";
import { renderProjectToFile } from "./render";

/**
 * End-to-end smoke render: bundle the composition, drive headless Chromium, and write a
 * real MP4. Uses colour visuals and captions so it needs no media on disk.
 *
 *   bun run --cwd apps/render smoke
 *
 * This is the check that answers "does path A actually produce a video", which is the
 * whole question behind the §7 decision gate.
 */
async function main() {
  const parsed = parseProject({
    schemaVersion: "0.1",
    id: createUuid(),
    name: "Smoke test",
    segments: [
      {
        id: createId("seg"),
        script: "Moths don't love light. They're lost.",
        durationMode: "manual",
        durationMs: 2000,
        captionsEnabled: true,
        visual: {
          main: { type: "color", color: "#1B1F3B" },
          overlays: [
            {
              id: createId("ov"),
              type: "text",
              text: "Mothlight",
              x: 0.5,
              y: 0.25,
              style: { font: "Inter-Bold", sizePt: 96, color: "#FFCC00" },
            },
          ],
        },
      },
      {
        id: createId("seg"),
        script: "They navigate by the moon.",
        durationMode: "manual",
        durationMs: 2000,
        captionsEnabled: true,
        visual: { main: { type: "color", color: "#3B1B2B" } },
      },
    ],
  });

  if (!parsed.ok) throw new Error(parsed.error);

  const outputDir = mkdtempSync(path.join(tmpdir(), "mothlight-smoke-"));
  const outputPath = path.join(outputDir, "smoke.mp4");

  console.info("Rendering to", outputPath);
  const startedAt = Date.now();

  await renderProjectToFile({
    project: parsed.project,
    assetPaths: {},
    outputPath,
    onProgress: (fraction) => {
      if (fraction === 1 || Math.round(fraction * 100) % 25 === 0) {
        process.stdout.write(`  ${Math.round(fraction * 100)}%\n`);
      }
    },
  });

  const { size } = statSync(outputPath);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.info(`\nOK — ${(size / 1024).toFixed(0)}KB in ${elapsed}s`);
  console.info(outputPath);
}

main().catch((error: unknown) => {
  console.error("\nSmoke render FAILED:", error);
  process.exit(1);
});
