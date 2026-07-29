import type { Project } from "@mothlight/core";
import { File } from "expo-file-system";
import { resolveAssetUri } from "./paths";

/**
 * On-disk facts about a project's assets, for render preflight and upload.
 *
 * Kept out of @mothlight/core because it touches the filesystem — core stays pure so it
 * can also run in the render worker, where these paths mean nothing.
 */

/** assetId -> byte size. Missing files count as zero rather than throwing. */
export async function assetSizesFor(project: Project): Promise<Record<string, number>> {
  const sizes: Record<string, number> = {};

  for (const asset of project.assets) {
    try {
      const file = new File(resolveAssetUri(project.id, asset.uri));
      sizes[asset.id] = file.exists ? (file.size ?? 0) : 0;
    } catch {
      sizes[asset.id] = 0;
    }
  }

  return sizes;
}

/** assetId -> absolute local URI, which is what a render engine needs to read bytes. */
export function resolvedAssetUris(project: Project): Record<string, string> {
  const uris: Record<string, string> = {};
  for (const asset of project.assets) {
    uris[asset.id] = resolveAssetUri(project.id, asset.uri);
  }
  return uris;
}
