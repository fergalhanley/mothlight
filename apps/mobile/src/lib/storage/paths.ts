import { Directory, File, Paths } from "expo-file-system";

/**
 * On-disk layout. Everything lives in the app sandbox; nothing syncs anywhere.
 *
 *   Documents/
 *     prefs.json                    local UI state (see ./prefs.ts)
 *     projects/
 *       <projectId>/
 *         project.json              the schema in @mothlight/core
 *         assets/
 *           <assetId>.<ext>         copied in on selection, never referenced in place
 */

export const PROJECT_FILE_NAME = "project.json";
export const ASSETS_DIR_NAME = "assets";

/** Project ids come from us, but a hand-edited import could carry anything. */
export function isSafeDirectoryName(id: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(id) && id !== "." && id !== "..";
}

function assertSafeId(id: string): string {
  if (!isSafeDirectoryName(id)) {
    throw new Error(`Refusing to use "${id}" as a directory name.`);
  }
  return id;
}

export function projectsDirectory(): Directory {
  return new Directory(Paths.document, "projects");
}

export function projectDirectory(projectId: string): Directory {
  return new Directory(projectsDirectory(), assertSafeId(projectId));
}

export function projectFile(projectId: string): File {
  return new File(projectDirectory(projectId), PROJECT_FILE_NAME);
}

export function projectAssetsDirectory(projectId: string): Directory {
  return new Directory(projectDirectory(projectId), ASSETS_DIR_NAME);
}

export function projectAssetFile(projectId: string, filename: string): File {
  return new File(projectAssetsDirectory(projectId), assertSafeId(filename));
}

/** Creates the projects root if this is a first launch. Safe to call repeatedly. */
export function ensureProjectsDirectory(): Directory {
  const dir = projectsDirectory();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Creates `projects/<id>/assets/`, and its parents. Safe to call repeatedly. */
export function ensureProjectDirectories(projectId: string): void {
  const assets = projectAssetsDirectory(projectId);
  if (!assets.exists) assets.create({ intermediates: true, idempotent: true });
}

/**
 * Asset URIs are stored relative to the project directory so a project stays portable,
 * then resolved to absolute `file://` URIs for playback. Absolute URIs that survived an
 * import are passed through unchanged.
 */
export function resolveAssetUri(projectId: string, uri: string): string {
  if (uri.startsWith("file://") || uri.startsWith("http://") || uri.startsWith("https://")) {
    return uri;
  }
  const relative = uri.replace(/^\.?\//, "");
  return new File(projectDirectory(projectId), relative).uri;
}
