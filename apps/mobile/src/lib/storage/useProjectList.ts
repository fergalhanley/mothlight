import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { forgetProject, loadPrefs, type Prefs } from "./prefs";
import { type BrokenProject, deleteProject, listProjects, type ProjectSummary } from "./projects";

/**
 * Dashboard state: the project list, its ordering, and the optimistic-delete dance.
 *
 * Delete is Material-style on both platforms — the row leaves immediately, an UNDO
 * snackbar runs for five seconds, and only then does anything touch the disk. There is
 * no confirmation dialog, so the undo window is the whole safety net; it has to survive
 * the app being backgrounded mid-countdown.
 */

export const UNDO_WINDOW_MS = 5000;

export type PendingDeletion = { summary: ProjectSummary };

export type ProjectListState = {
  projects: ProjectSummary[];
  broken: BrokenProject[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  pendingDeletion: PendingDeletion | null;
  /** Hides the row and starts the undo countdown. Nothing is deleted yet. */
  requestDelete: (summary: ProjectSummary) => void;
  undoDelete: () => void;
};

export function useProjectList(): ProjectListState {
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [broken, setBroken] = useState<BrokenProject[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors pendingDeletion so the AppState listener and unmount cleanup can commit
  // without being re-subscribed on every state change.
  const pendingRef = useRef<PendingDeletion | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [listing, loadedPrefs] = await Promise.all([listProjects(), loadPrefs()]);
      setSummaries(listing.summaries);
      setBroken(listing.broken);
      setPrefs(loadedPrefs);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read your projects.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Re-read on focus: the editor may have changed a name, duration, or thumbnail.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Point of no return: removes the directory and forgets the project's local state. */
  const commitDeletion = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;

    pendingRef.current = null;
    clearTimer();
    setPendingDeletion(null);

    try {
      await deleteProject(pending.summary.id);
      await forgetProject(pending.summary.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete that project.");
    } finally {
      await refresh();
    }
  }, [clearTimer, refresh]);

  const requestDelete = useCallback(
    (summary: ProjectSummary) => {
      // A second swipe while one is pending commits the first — two undo bars would be
      // ambiguous about which project UNDO refers to.
      if (pendingRef.current) void commitDeletion();

      pendingRef.current = { summary };
      setPendingDeletion({ summary });

      clearTimer();
      timerRef.current = setTimeout(() => {
        void commitDeletion();
      }, UNDO_WINDOW_MS);
    },
    [clearTimer, commitDeletion],
  );

  const undoDelete = useCallback(() => {
    clearTimer();
    pendingRef.current = null;
    setPendingDeletion(null);
  }, [clearTimer]);

  // Backgrounding commits: leaving a deletion in limbo across a process death would
  // resurrect a project the user believes is gone.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && pendingRef.current) void commitDeletion();
    });
    return () => subscription.remove();
  }, [commitDeletion]);

  useEffect(() => clearTimer, [clearTimer]);

  const projects = useMemo(() => {
    const hiddenId = pendingDeletion?.summary.id;
    const lastOpenedAt = prefs?.lastOpenedAt ?? {};

    return summaries
      .filter((summary) => summary.id !== hiddenId)
      .slice()
      .sort((a, b) => {
        // Newest-last-opened first; a project never opened falls back to when it changed.
        const aAt = lastOpenedAt[a.id] ?? a.updatedAt;
        const bAt = lastOpenedAt[b.id] ?? b.updatedAt;
        return bAt.localeCompare(aAt);
      });
  }, [summaries, prefs, pendingDeletion]);

  return {
    projects,
    broken,
    isLoading,
    error,
    refresh,
    pendingDeletion,
    requestDelete,
    undoDelete,
  };
}
