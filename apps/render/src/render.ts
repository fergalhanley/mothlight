import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Project, RENDER_OUTPUT } from "@mothlight/core";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { COMPOSITION_ID } from "../remotion/Root";

/**
 * Turning a project into an MP4.
 *
 * The Remotion bundle is built once per process and reused. Bundling is the slow part
 * (webpack over the composition), and rebuilding it per job would dominate render time.
 */

let bundlePromise: Promise<string> | null = null;

function getBundle(): Promise<string> {
  if (!bundlePromise) {
    const entry = path.resolve(import.meta.dirname, "../remotion/index.ts");
    bundlePromise = bundle({
      entryPoint: entry,
      // Keep webpack's noise out of the job log; failures still throw.
      onProgress: () => undefined,
    });
  }
  return bundlePromise;
}

/** Warms the bundle at boot so the first user's render is not the one that pays for it. */
export async function warmBundle(): Promise<void> {
  await getBundle();
}

export type RenderToFileOptions = {
  project: Project;
  /** assetId -> absolute path on this machine. */
  assetPaths: Record<string, string>;
  outputPath: string;
  onProgress?: (fraction: number) => void;
};

export async function renderProjectToFile(options: RenderToFileOptions): Promise<void> {
  const { project, assetPaths, outputPath, onProgress } = options;

  // Remotion loads media through the browser, so local files need file:// URLs.
  const assetSources: Record<string, string> = {};
  for (const [assetId, filePath] of Object.entries(assetPaths)) {
    if (!existsSync(filePath)) continue;
    assetSources[assetId] = pathToFileURL(filePath).href;
  }

  const serveUrl = await getBundle();
  const inputProps = { project, assetSources };

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    // §7's output profile.
    crf: undefined,
    videoBitrate: `${RENDER_OUTPUT.videoBitrateKbps}k`,
    audioBitrate: `${RENDER_OUTPUT.audioBitrateKbps}k`,
    x264Preset: "medium",
    // faststart, so the file plays while still downloading.
    muted: false,
    onProgress: ({ progress }) => onProgress?.(progress),
    chromiumOptions: {
      // Required in most containers: no sandbox, and software GL for determinism.
      gl: "swangle",
    },
  });
}
