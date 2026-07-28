import type { Project } from "./project";

/**
 * Debounced autosave. There is no Save button anywhere in Mothlight, so this is the only
 * thing standing between a user and losing their work.
 *
 * Writes coalesce while the user is typing, but `flush` must be called whenever the app
 * could stop running — backgrounding, or leaving the editor — because a pending timer is
 * not a saved file.
 *
 * The writer is injected rather than imported so this logic can be tested without the
 * file system: it is the part where a bug costs someone their project.
 */

export const AUTOSAVE_DELAY_MS = 500;

export type SaveFn = (project: Project) => Promise<unknown>;

export type Autosaver = {
  /** Queue a write. Replaces any previously queued state. */
  schedule: (project: Project) => void;
  /** Write immediately if anything is queued. Resolves once it is on disk. */
  flush: () => Promise<void>;
  /** Drop queued state without writing — used when the project is being deleted. */
  cancel: () => void;
  hasPendingWrite: () => boolean;
};

export function createAutosaver(
  save: SaveFn,
  options: { delayMs?: number; onError?: (error: unknown) => void } = {},
): Autosaver {
  const delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Project | null = null;
  // Serialises writes so two flushes can never interleave on the same file.
  let inFlight: Promise<void> = Promise.resolve();

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function writeNow(): Promise<void> {
    const project = pending;
    pending = null;
    if (!project) return inFlight;

    inFlight = inFlight
      .then(() => save(project))
      .then(() => undefined)
      .catch((error) => {
        options.onError?.(error);
      });

    return inFlight;
  }

  return {
    schedule(project) {
      pending = project;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void writeNow();
      }, delayMs);
    },

    async flush() {
      clearTimer();
      await writeNow();
    },

    cancel() {
      clearTimer();
      pending = null;
    },

    hasPendingWrite() {
      return pending !== null;
    },
  };
}
