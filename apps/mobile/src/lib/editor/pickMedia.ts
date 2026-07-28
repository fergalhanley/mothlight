import type { Asset } from "@mothlight/core";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { importAudioAsset, importImageAsset, importVideoAsset } from "../storage/assets";

/**
 * Choosing media, and copying whatever comes back into the project.
 *
 * Permissions are requested here, at the point of use, rather than on launch — a
 * permission wall on first open is both worse UX and a review risk.
 */

export type PickResult =
  | { status: "picked"; asset: Asset }
  | { status: "cancelled" }
  | { status: "denied" }
  | { status: "failed"; error: string };

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Could not import that file.";
}

/** Photo library → a copied, downscaled image or a copied video. */
export async function pickVisualFromLibrary(projectId: string): Promise<PickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: "denied" };

  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: false,
      quality: 1,
    });

    if (result.canceled) return { status: "cancelled" };

    const picked = result.assets[0];
    if (!picked) return { status: "cancelled" };

    if (picked.type === "video") {
      const asset = await importVideoAsset(projectId, picked.uri, {
        source: "photo-library",
        originalFilename: picked.fileName ?? null,
        durationMs: picked.duration ?? null,
        width: picked.width,
        height: picked.height,
      });
      return { status: "picked", asset };
    }

    const asset = await importImageAsset(projectId, picked.uri, {
      source: "photo-library",
      originalFilename: picked.fileName ?? null,
    });
    return { status: "picked", asset };
  } catch (cause) {
    return { status: "failed", error: describe(cause) };
  }
}

/** Files app → an image or video that never went through the photo library. */
export async function pickVisualFromFiles(projectId: string): Promise<PickResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return { status: "cancelled" };

    const picked = result.assets[0];
    if (!picked) return { status: "cancelled" };

    const isVideo = picked.mimeType?.startsWith("video/") ?? false;

    const asset = isVideo
      ? await importVideoAsset(projectId, picked.uri, {
          source: "files",
          originalFilename: picked.name,
        })
      : await importImageAsset(projectId, picked.uri, {
          source: "files",
          originalFilename: picked.name,
        });

    return { status: "picked", asset };
  } catch (cause) {
    return { status: "failed", error: describe(cause) };
  }
}

/** Files app → an audio file, for a voiceover recorded elsewhere or a music bed. */
export async function pickAudioFromFiles(projectId: string): Promise<PickResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["audio/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return { status: "cancelled" };

    const picked = result.assets[0];
    if (!picked) return { status: "cancelled" };

    const asset = await importAudioAsset(projectId, picked.uri, {
      source: "files",
      originalFilename: picked.name,
    });
    return { status: "picked", asset };
  } catch (cause) {
    return { status: "failed", error: describe(cause) };
  }
}
