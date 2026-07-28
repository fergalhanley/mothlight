import {
  createEmptyProject,
  createId,
  createUuid,
  formatDurationMs,
  PROJECT_SCHEMA_VERSION,
  type Project,
  parseProject,
  parseProjectForImport,
  resolveProjectDurationMs,
} from "@mothlight/core";
import { Directory, File } from "expo-file-system";
import {
  ensureProjectDirectories,
  ensureProjectsDirectory,
  PROJECT_FILE_NAME,
  projectAssetsDirectory,
  projectDirectory,
  projectFile,
  resolveAssetUri,
} from "./paths";

/**
 * The project repository.
 *
 * Deliberately no database. Projects are a handful of JSON files, search has to read
 * script text anyway, and a separate index is one more thing that can disagree with the
 * truth on disk. If the project count ever justifies SQLite, this module is the seam.
 */

/** What the dashboard needs for one row, without holding every project in memory. */
export type ProjectSummary = {
  id: string;
  name: string;
  segmentCount: number;
  durationMs: number;
  durationLabel: string;
  updatedAt: string;
  /** Absolute URI of the first segment's image, if it has one. */
  thumbnailUri: string | null;
  /** Lower-cased name + every script, so search can match either. */
  searchText: string;
};

/** A project directory that exists but could not be read. Surfaced, never silently dropped. */
export type BrokenProject = { id: string; error: string };

export type ProjectListing = {
  summaries: ProjectSummary[];
  broken: BrokenProject[];
};

// --- Atomic writes --------------------------------------------------------------------

/**
 * Writes via a temp file and a rename, so a crash or a full disk can never leave a
 * half-written project.json behind. A truncated file would lose the user's work.
 */
function writeFileAtomically(directory: Directory, name: string, contents: string): void {
  const temp = new File(directory, `.${name}.tmp`);
  if (temp.exists) temp.delete();

  temp.create({ overwrite: true, intermediates: true });
  temp.write(contents);

  temp.moveSync(new File(directory, name), { overwrite: true });
}

// --- Migrations -----------------------------------------------------------------------

/**
 * Migration hook. Nothing to migrate yet — v0.1 is the first schema — but the seam
 * exists so the first real migration is an edit here rather than a refactor.
 */
function applyMigrations(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const record = raw as Record<string, unknown>;

  // Files written before schemaVersion existed are treated as the first version.
  if (record.schemaVersion === undefined) {
    return { ...record, schemaVersion: PROJECT_SCHEMA_VERSION };
  }

  return record;
}

// --- Reading --------------------------------------------------------------------------

function summarise(project: Project): ProjectSummary {
  const firstImage = project.segments
    .map((segment) => segment.visual.main)
    .find((main) => main?.type === "image" && main.assetId);

  const thumbnailAsset = firstImage?.assetId
    ? project.assets.find((asset) => asset.id === firstImage.assetId)
    : undefined;

  const durationMs = resolveProjectDurationMs(project);

  return {
    id: project.id,
    name: project.name,
    segmentCount: project.segments.length,
    durationMs,
    durationLabel: formatDurationMs(durationMs),
    updatedAt: project.updatedAt,
    thumbnailUri: thumbnailAsset ? resolveAssetUri(project.id, thumbnailAsset.uri) : null,
    searchText: [project.name, ...project.segments.map((s) => s.script)].join("\n").toLowerCase(),
  };
}

/** Reads one project from disk. Returns null when the directory has no project.json. */
export async function loadProject(id: string): Promise<Project | null> {
  const file = projectFile(id);
  if (!file.exists) return null;

  const raw = JSON.parse(await file.text());
  const result = parseProject(applyMigrations(raw));
  if (!result.ok) throw new Error(result.error);

  // The directory name is the truth: it is what every asset path is relative to.
  return result.project.id === id ? result.project : { ...result.project, id };
}

/**
 * Every project on disk, newest-updated first.
 *
 * A project that fails to parse is reported rather than thrown, so one corrupt file
 * cannot make the dashboard unopenable.
 */
export async function listProjects(): Promise<ProjectListing> {
  const root = ensureProjectsDirectory();

  const summaries: ProjectSummary[] = [];
  const broken: BrokenProject[] = [];

  for (const entry of root.list()) {
    if (!(entry instanceof Directory)) continue;
    const id = entry.name;

    try {
      const project = await loadProject(id);
      if (project) summaries.push(summarise(project));
    } catch (cause) {
      broken.push({ id, error: cause instanceof Error ? cause.message : "Unreadable project" });
    }
  }

  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { summaries, broken };
}

// --- Writing --------------------------------------------------------------------------

/** Persists a project, stamping `updatedAt`. This is the only path that writes project.json. */
export async function saveProject(project: Project): Promise<Project> {
  ensureProjectDirectories(project.id);

  const next: Project = { ...project, updatedAt: new Date().toISOString() };
  writeFileAtomically(
    projectDirectory(project.id),
    PROJECT_FILE_NAME,
    JSON.stringify(next, null, 2),
  );

  return next;
}

export async function createProject(name?: string): Promise<Project> {
  const project = createEmptyProject(name);
  return saveProject(project);
}

export async function renameProject(id: string, name: string): Promise<Project> {
  const project = await loadProject(id);
  if (!project) throw new Error("That project no longer exists.");
  return saveProject({ ...project, name });
}

/**
 * Copies a project, assets and all, under a fresh id. Asset ids are kept — they are only
 * ever resolved within their own project — so nothing inside the file needs rewriting.
 */
export async function duplicateProject(id: string): Promise<Project> {
  const source = await loadProject(id);
  if (!source) throw new Error("That project no longer exists.");

  const copy: Project = {
    ...source,
    id: createUuid(),
    name: `${source.name} copy`,
    createdAt: new Date().toISOString(),
  };

  ensureProjectDirectories(copy.id);

  const sourceAssets = projectAssetsDirectory(id);
  if (sourceAssets.exists) {
    const destination = projectAssetsDirectory(copy.id);
    for (const entry of sourceAssets.list()) {
      if (entry instanceof File) entry.copySync(new File(destination, entry.name));
    }
  }

  return saveProject(copy);
}

/** Removes the project directory and everything in it. Irreversible. */
export async function deleteProject(id: string): Promise<void> {
  const dir = projectDirectory(id);
  if (dir.exists) dir.delete();
}

// --- Import / export ------------------------------------------------------------------

/** The exact bytes written when the user taps "Export project". */
export function serialiseProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Validates an incoming file and stores it as a new project.
 *
 * The project is given a fresh id so importing the same file twice makes two projects
 * rather than silently overwriting the first. Assets referenced by an imported file are
 * not fetched — an agent-authored script has none, which is the intended workflow.
 */
export async function importProject(
  rawText: string,
): Promise<{ ok: true; project: Project } | { ok: false; error: string }> {
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }

  const result = parseProjectForImport(applyMigrations(raw));
  if (!result.ok) return result;

  const project: Project = {
    ...result.project,
    id: createUuid(),
    segments: result.project.segments.map((segment) => ({
      ...segment,
      // Regenerate ids so a file imported twice cannot collide with itself.
      id: createId("seg"),
    })),
  };

  return { ok: true, project: await saveProject(project) };
}
