import type { Project } from "@mothlight/core";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { importProject } from "./projects";

/**
 * Bringing a project file in from outside — the Files app, a share sheet, or a download.
 *
 * The interesting case is an agent-authored script: scripts and segment structure, no
 * assets at all. That is valid by design (§1), and the editor shows those segments as
 * "needs a visual" placeholders for the human to fill in.
 */

export type ImportResult =
  | { status: "imported"; project: Project }
  | { status: "cancelled" }
  | { status: "failed"; error: string };

/** Reads a file already on disk (share-sheet or file-open entry points). */
export async function importProjectFromUri(uri: string): Promise<ImportResult> {
  try {
    const file = new File(uri);
    if (!file.exists) return { status: "failed", error: "That file could not be found." };

    const result = await importProject(await file.text());
    if (!result.ok) return { status: "failed", error: result.error };

    return { status: "imported", project: result.project };
  } catch (cause) {
    return {
      status: "failed",
      error: cause instanceof Error ? cause.message : "That file could not be read.",
    };
  }
}

/** Dashboard → Import project… */
export async function pickAndImportProject(): Promise<ImportResult> {
  try {
    const picked = await DocumentPicker.getDocumentAsync({
      // Some providers report .json as octet-stream, so accept both and let the parser
      // be the judge — its errors are more useful than a greyed-out file.
      type: ["application/json", "public.json", "application/octet-stream"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (picked.canceled) return { status: "cancelled" };

    const asset = picked.assets[0];
    if (!asset) return { status: "cancelled" };

    return importProjectFromUri(asset.uri);
  } catch (cause) {
    return {
      status: "failed",
      error: cause instanceof Error ? cause.message : "That file could not be imported.",
    };
  }
}
