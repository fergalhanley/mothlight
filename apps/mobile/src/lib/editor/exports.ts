import { type Project, toFcp7Xml, toSafeFilename, toScriptMarkdown } from "@mothlight/core";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { resolveAssetUri } from "../storage/paths";
import { serialiseProject } from "../storage/projects";

/**
 * Exports.
 *
 * Each writes a file into a scratch directory in the cache and hands it to the OS share
 * sheet. The cache is the right home: these are throwaway copies, and the system is free
 * to reclaim them once the user has sent the file wherever it was going.
 */

const EXPORT_DIR_NAME = "exports";

export type ExportResult =
  | { status: "shared" }
  | { status: "unavailable" }
  | { status: "failed"; error: string };

function exportDirectory(): Directory {
  const dir = new Directory(Paths.cache, EXPORT_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function writeAndShare(
  filename: string,
  contents: string,
  options: { mimeType: string; uti: string; dialogTitle: string },
): Promise<ExportResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { status: "unavailable" };

    const file = new File(exportDirectory(), filename);
    if (file.exists) file.delete();
    file.create({ overwrite: true, intermediates: true });
    file.write(contents);

    await Sharing.shareAsync(file.uri, {
      mimeType: options.mimeType,
      UTI: options.uti,
      dialogTitle: options.dialogTitle,
    });

    return { status: "shared" };
  } catch (cause) {
    return {
      status: "failed",
      error: cause instanceof Error ? cause.message : "Could not export that.",
    };
  }
}

/** The script as a readable document — headings and words, no timing metadata. */
export function shareScript(project: Project): Promise<ExportResult> {
  return writeAndShare(toSafeFilename(project.name, "md"), toScriptMarkdown(project), {
    mimeType: "text/markdown",
    uti: "net.daringfireball.markdown",
    dialogTitle: "Export script",
  });
}

/** The project file itself — the schema in @mothlight/core, media referenced not embedded. */
export function shareProjectJson(project: Project): Promise<ExportResult> {
  return writeAndShare(toSafeFilename(project.name, "json"), serialiseProject(project), {
    mimeType: "application/json",
    uti: "public.json",
    dialogTitle: "Export project",
  });
}

/**
 * FCP7 XML for Resolve or Premiere.
 *
 * The XML references media by absolute path on this device, so it is only useful next to
 * the assets themselves. The editor surfaces that caveat when offering this export —
 * silently handing someone a timeline full of offline media would be worse than not
 * offering it at all.
 */
export function shareTimelineXml(project: Project): Promise<ExportResult> {
  const xml = toFcp7Xml(project, {
    resolveAssetPath: (uri) => resolveAssetUri(project.id, uri),
  });

  return writeAndShare(toSafeFilename(project.name, "xml"), xml, {
    mimeType: "application/xml",
    uti: "public.xml",
    dialogTitle: "Export timeline",
  });
}
