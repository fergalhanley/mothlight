import {
  type Asset,
  createAutosaver,
  createEmptySegment,
  createId,
  type Project,
  resolveProjectDurationMs,
  type Segment,
} from "@mothlight/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { removeAssetFile } from "../storage/assets";
import { setEditorState } from "../storage/prefs";
import { loadProject, saveProject } from "../storage/projects";

/**
 * Editor state for one project.
 *
 * Every mutation goes through `update`, which keeps React state and the autosaver in
 * step. There is no Save button anywhere in Mothlight, so the invariant that matters is
 * that nothing can change the project without scheduling a write.
 */

export type EditorState = {
  project: Project | null;
  isLoading: boolean;
  error: string | null;
  durationMs: number;

  expandedSegmentId: string | null;
  setExpandedSegmentId: (id: string | null) => void;

  update: (mutate: (project: Project) => Project) => void;
  updateSegment: (segmentId: string, mutate: (segment: Segment) => Segment) => void;

  addSegment: () => void;
  duplicateSegment: (segmentId: string) => void;
  deleteSegment: (segmentId: string) => void;
  moveSegment: (segmentId: string, direction: -1 | 1) => void;

  addAsset: (asset: Asset) => void;
  removeAsset: (assetId: string) => void;

  /** Writes any pending change immediately. Call before navigating away. */
  flush: () => Promise<void>;
};

export function useEditor(projectId: string): EditorState {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSegmentId, setExpandedSegmentIdState] = useState<string | null>(null);

  const autosaver = useMemo(
    () =>
      createAutosaver(saveProject, {
        onError: (cause) =>
          setError(cause instanceof Error ? cause.message : "Could not save your changes."),
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    loadProject(projectId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setError("That project no longer exists.");
          return;
        }
        setProject(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not open that project.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const update = useCallback(
    (mutate: (project: Project) => Project) => {
      setProject((previous) => {
        if (!previous) return previous;
        const next = mutate(previous);
        autosaver.schedule(next);
        return next;
      });
    },
    [autosaver],
  );

  const updateSegment = useCallback(
    (segmentId: string, mutate: (segment: Segment) => Segment) => {
      update((current) => ({
        ...current,
        segments: current.segments.map((segment) =>
          segment.id === segmentId ? mutate(segment) : segment,
        ),
      }));
    },
    [update],
  );

  const addSegment = useCallback(() => {
    const segment = createEmptySegment();
    update((current) => ({ ...current, segments: [...current.segments, segment] }));
    // Open the new segment straight away — the user added it to put something in it.
    setExpandedSegmentIdState(segment.id);
  }, [update]);

  const duplicateSegment = useCallback(
    (segmentId: string) => {
      update((current) => {
        const index = current.segments.findIndex((segment) => segment.id === segmentId);
        if (index === -1) return current;

        const source = current.segments[index];
        if (!source) return current;

        // New ids for the segment and its overlays; assets are shared, not copied,
        // because both segments point at the same file in the same project.
        const copy: Segment = {
          ...source,
          id: createId("seg"),
          visual: {
            ...source.visual,
            overlays: source.visual.overlays.map((overlay) => ({
              ...overlay,
              id: createId("ov"),
            })),
          },
        };

        const segments = [...current.segments];
        segments.splice(index + 1, 0, copy);
        return { ...current, segments };
      });
    },
    [update],
  );

  const deleteSegment = useCallback(
    (segmentId: string) => {
      update((current) => ({
        ...current,
        segments: current.segments.filter((segment) => segment.id !== segmentId),
      }));
      setExpandedSegmentIdState((current) => (current === segmentId ? null : current));
    },
    [update],
  );

  const moveSegment = useCallback(
    (segmentId: string, direction: -1 | 1) => {
      update((current) => {
        const index = current.segments.findIndex((segment) => segment.id === segmentId);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= current.segments.length) return current;

        const segments = [...current.segments];
        const [moved] = segments.splice(index, 1);
        if (!moved) return current;
        segments.splice(target, 0, moved);
        return { ...current, segments };
      });
    },
    [update],
  );

  const addAsset = useCallback(
    (asset: Asset) => {
      update((current) => ({ ...current, assets: [...current.assets, asset] }));
    },
    [update],
  );

  /**
   * Drops an asset and every reference to it, then deletes the file. Leaving a dangling
   * assetId behind would make the project fail its own validation on next load.
   */
  const removeAsset = useCallback(
    (assetId: string) => {
      update((current) => {
        const asset = current.assets.find((candidate) => candidate.id === assetId);
        if (asset) removeAssetFile(current.id, asset);

        return {
          ...current,
          assets: current.assets.filter((candidate) => candidate.id !== assetId),
          soundtrack:
            current.soundtrack.assetId === assetId
              ? { ...current.soundtrack, assetId: null }
              : current.soundtrack,
          segments: current.segments.map((segment) => ({
            ...segment,
            visual: {
              ...segment.visual,
              main: segment.visual.main?.assetId === assetId ? null : segment.visual.main,
              overlays: segment.visual.overlays.filter((overlay) => overlay.assetId !== assetId),
            },
            audio: {
              ...segment.audio,
              vo: segment.audio.vo?.assetId === assetId ? null : segment.audio.vo,
            },
          })),
        };
      });
    },
    [update],
  );

  const setExpandedSegmentId = useCallback(
    (id: string | null) => {
      setExpandedSegmentIdState(id);
      // Persisted so relaunch lands where the user left off.
      void setEditorState({ projectId, expandedSegmentId: id });
    },
    [projectId],
  );

  const flush = useCallback(() => autosaver.flush(), [autosaver]);

  // Backgrounding is the most likely moment for the process to be killed.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void autosaver.flush();
    });
    return () => subscription.remove();
  }, [autosaver]);

  // Unmount covers navigating back to the dashboard.
  useEffect(() => {
    return () => {
      void autosaver.flush();
    };
  }, [autosaver]);

  const durationMs = useMemo(() => (project ? resolveProjectDurationMs(project) : 0), [project]);

  return {
    project,
    isLoading,
    error,
    durationMs,
    expandedSegmentId,
    setExpandedSegmentId,
    update,
    updateSegment,
    addSegment,
    duplicateSegment,
    deleteSegment,
    moveSegment,
    addAsset,
    removeAsset,
    flush,
  };
}
