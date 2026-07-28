import { Directory, File, Paths } from "expo-file-system";

/**
 * Local UI state: which projects were opened when, where the user was last, and whether
 * the demo has been seeded.
 *
 * Kept out of project.json on purpose. That file is the export format, and "I last
 * opened this on Tuesday" is not something anyone wants travelling with a shared script.
 */

const PREFS_FILE_NAME = "prefs.json";

export type EditorState = {
  projectId: string;
  /** Which segment accordion was open, so relaunch lands where the user left off. */
  expandedSegmentId: string | null;
};

export type Prefs = {
  /** projectId -> ISO timestamp. Drives the dashboard's newest-last-opened ordering. */
  lastOpenedAt: Record<string, string>;
  lastEditor: EditorState | null;
  /** The demo project is seeded once, on first launch, and never resurrected. */
  hasSeededDemo: boolean;
};

const EMPTY_PREFS: Prefs = {
  lastOpenedAt: {},
  lastEditor: null,
  hasSeededDemo: false,
};

let cache: Prefs | null = null;

function prefsFile(): File {
  return new File(Paths.document, PREFS_FILE_NAME);
}

function writeAtomically(contents: string): void {
  const directory = new Directory(Paths.document);
  const temp = new File(directory, `.${PREFS_FILE_NAME}.tmp`);
  if (temp.exists) temp.delete();

  temp.create({ overwrite: true, intermediates: true });
  temp.write(contents);
  temp.moveSync(new File(directory, PREFS_FILE_NAME), { overwrite: true });
}

/** Reads prefs, falling back to defaults. Corrupt prefs are never fatal — they are UI state. */
export async function loadPrefs(): Promise<Prefs> {
  if (cache) return cache;

  const file = prefsFile();
  if (!file.exists) {
    cache = { ...EMPTY_PREFS };
    return cache;
  }

  try {
    const parsed = JSON.parse(await file.text()) as Partial<Prefs>;
    cache = {
      lastOpenedAt:
        typeof parsed.lastOpenedAt === "object" && parsed.lastOpenedAt !== null
          ? parsed.lastOpenedAt
          : {},
      lastEditor: parsed.lastEditor ?? null,
      hasSeededDemo: parsed.hasSeededDemo === true,
    };
  } catch {
    cache = { ...EMPTY_PREFS };
  }

  return cache;
}

async function updatePrefs(mutate: (prefs: Prefs) => Prefs): Promise<Prefs> {
  const next = mutate(await loadPrefs());
  cache = next;
  writeAtomically(JSON.stringify(next, null, 2));
  return next;
}

export async function markProjectOpened(projectId: string): Promise<void> {
  await updatePrefs((prefs) => ({
    ...prefs,
    lastOpenedAt: { ...prefs.lastOpenedAt, [projectId]: new Date().toISOString() },
  }));
}

export async function forgetProject(projectId: string): Promise<void> {
  await updatePrefs((prefs) => {
    const { [projectId]: _removed, ...rest } = prefs.lastOpenedAt;
    return {
      ...prefs,
      lastOpenedAt: rest,
      lastEditor: prefs.lastEditor?.projectId === projectId ? null : prefs.lastEditor,
    };
  });
}

export async function setEditorState(state: EditorState | null): Promise<void> {
  await updatePrefs((prefs) => ({ ...prefs, lastEditor: state }));
}

export async function markDemoSeeded(): Promise<void> {
  await updatePrefs((prefs) => ({ ...prefs, hasSeededDemo: true }));
}

/** Test seam — drops the in-memory copy so the next read hits disk. */
export function resetPrefsCache(): void {
  cache = null;
}
