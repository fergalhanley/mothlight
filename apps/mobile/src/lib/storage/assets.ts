import { type Asset, type AssetKind, type AssetSource, createId } from "@mothlight/core";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { ASSETS_DIR_NAME, ensureProjectDirectories, projectAssetsDirectory } from "./paths";

/**
 * Bringing media into a project.
 *
 * Everything is **copied** into the project's sandbox on selection. Holding a
 * photo-library reference is not an option: the OS deletes, moves, and re-encodes those
 * behind your back, and the project silently breaks weeks later.
 */

/** Stills are downscaled to this on the long edge — memory and render time both care. */
export const MAX_IMAGE_LONG_EDGE = 2160;

/** JPEG quality for downscaled stills. High enough that nobody can see the difference. */
const JPEG_QUALITY = 0.9;

function extensionFor(uri: string, fallback: string): string {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(withoutQuery);
  return match?.[1] ? match[1].toLowerCase() : fallback;
}

/** `assets/<id>.<ext>` — relative, so the project stays portable. */
function relativeUri(filename: string): string {
  return `${ASSETS_DIR_NAME}/${filename}`;
}

function copyIntoProject(projectId: string, sourceUri: string, filename: string): void {
  ensureProjectDirectories(projectId);
  const destination = new File(projectAssetsDirectory(projectId), filename);
  if (destination.exists) destination.delete();
  new File(sourceUri).copySync(destination);
}

/**
 * Copies an image in, downscaling it if either edge exceeds {@link MAX_IMAGE_LONG_EDGE}.
 * Re-encodes to JPEG, which also normalises HEIC from the iOS photo library.
 */
export async function importImageAsset(
  projectId: string,
  sourceUri: string,
  options: { source: AssetSource; originalFilename?: string | null },
): Promise<Asset> {
  const context = ImageManipulator.manipulate(sourceUri);
  let image = await context.renderAsync();

  const longEdge = Math.max(image.width, image.height);
  if (longEdge > MAX_IMAGE_LONG_EDGE) {
    const scale = MAX_IMAGE_LONG_EDGE / longEdge;
    context.resize({
      width: Math.round(image.width * scale),
      height: Math.round(image.height * scale),
    });
    image = await context.renderAsync();
  }

  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });

  const id = createId("asset");
  const filename = `${id}.jpg`;
  copyIntoProject(projectId, saved.uri, filename);

  // The manipulator writes to the cache directory; we have our own copy now.
  const scratch = new File(saved.uri);
  if (scratch.exists) scratch.delete();

  return {
    id,
    kind: "image",
    uri: relativeUri(filename),
    source: options.source,
    originalFilename: options.originalFilename ?? null,
    durationMs: null,
    width: saved.width,
    height: saved.height,
  };
}

/** Copies a video in as-is. No transcode — that is the renderer's job. */
export async function importVideoAsset(
  projectId: string,
  sourceUri: string,
  options: {
    source: AssetSource;
    originalFilename?: string | null;
    durationMs?: number | null;
    width?: number | null;
    height?: number | null;
  },
): Promise<Asset> {
  const id = createId("asset");
  const filename = `${id}.${extensionFor(sourceUri, "mp4")}`;
  copyIntoProject(projectId, sourceUri, filename);

  return {
    id,
    kind: "video",
    uri: relativeUri(filename),
    source: options.source,
    originalFilename: options.originalFilename ?? null,
    durationMs: options.durationMs ?? null,
    width: options.width ?? null,
    height: options.height ?? null,
  };
}

/** Copies audio in — a recorded voiceover, or an imported music bed. */
export async function importAudioAsset(
  projectId: string,
  sourceUri: string,
  options: { source: AssetSource; originalFilename?: string | null; durationMs?: number | null },
): Promise<Asset> {
  const id = createId("asset");
  const filename = `${id}.${extensionFor(sourceUri, "m4a")}`;
  copyIntoProject(projectId, sourceUri, filename);

  return {
    id,
    kind: "audio",
    uri: relativeUri(filename),
    source: options.source,
    originalFilename: options.originalFilename ?? null,
    durationMs: options.durationMs ?? null,
    width: null,
    height: null,
  };
}

export function assetKindForPickedType(type: string | undefined): AssetKind {
  return type === "video" ? "video" : "image";
}

/** Deletes the backing file. The caller is responsible for dropping the reference too. */
export function removeAssetFile(projectId: string, asset: Asset): void {
  const filename = asset.uri.split("/").pop();
  if (!filename) return;

  const file = new File(projectAssetsDirectory(projectId), filename);
  if (file.exists) file.delete();
}
