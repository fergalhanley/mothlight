import {
  isTerminalStatus,
  type Project,
  type RenderEngine,
  type RenderJob,
  type RenderRequest,
} from "@mothlight/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/**
 * Drives one render from start to saved file.
 *
 * §7's v0 simplification: poll while the app is foregrounded, and stop when it is not.
 * Backgrounded polling would burn battery for no benefit, and a job that finishes while
 * the user is elsewhere is picked up the moment they come back.
 */

const POLL_INTERVAL_MS = 2000;

export type RenderPhase =
  | "idle"
  | "uploading"
  | "waiting"
  | "downloading"
  | "saving"
  | "done"
  | "failed";

export type RenderState = {
  phase: RenderPhase;
  job: RenderJob | null;
  /** 0–1 during upload. */
  uploadProgress: number;
  error: string | null;
  /** Local URI of the finished video, once downloaded. */
  outputUri: string | null;
  start: (request: RenderRequest) => Promise<void>;
  reset: () => void;
};

export function useRenderJob(
  engine: RenderEngine,
  options: { onDownloaded: (uri: string, project: Project) => Promise<void> },
): RenderState {
  const { onDownloaded } = options;

  const [phase, setPhase] = useState<RenderPhase>("idle");
  const [job, setJob] = useState<RenderJob | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [outputUri, setOutputUri] = useState<string | null>(null);

  const projectRef = useRef<Project | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fail = useCallback((message: string) => {
    setError(message);
    setPhase("failed");
  }, []);

  /** Download, hand to the caller to save, and finish. */
  const finish = useCallback(
    async (completed: RenderJob) => {
      const project = projectRef.current;
      if (!project) return;

      try {
        setPhase("downloading");
        const uri = await engine.fetchOutput(completed);
        if (cancelledRef.current) return;

        setOutputUri(uri);
        setPhase("saving");
        await onDownloaded(uri, project);
        if (cancelledRef.current) return;

        setPhase("done");
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : "Could not save the finished video.");
      }
    },
    [engine, onDownloaded, fail],
  );

  const pollOnce = useCallback(
    async (jobId: string) => {
      try {
        const next = await engine.poll(jobId);
        if (cancelledRef.current) return;

        setJob(next);

        if (next.status === "failed") {
          fail(next.error ?? "The render failed.");
          return;
        }
        if (next.status === "completed") {
          await finish(next);
          return;
        }

        // Not terminal — keep waiting, but only while we are on screen.
        if (AppState.currentState === "active") {
          timerRef.current = setTimeout(() => void pollOnce(jobId), POLL_INTERVAL_MS);
        }
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : "Lost contact with the render service.");
      }
    },
    [engine, fail, finish],
  );

  const start = useCallback(
    async (request: RenderRequest) => {
      cancelledRef.current = false;
      projectRef.current = request.project;

      setError(null);
      setOutputUri(null);
      setUploadProgress(0);
      setPhase("uploading");

      try {
        const started = await engine.start(request, setUploadProgress);
        if (cancelledRef.current) return;

        setJob(started);

        if (isTerminalStatus(started.status)) {
          if (started.status === "completed") await finish(started);
          else fail(started.error ?? "The render failed.");
          return;
        }

        setPhase("waiting");
        void pollOnce(started.id);
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : "Could not start the render.");
      }
    },
    [engine, finish, fail, pollOnce],
  );

  // Resume polling when the user comes back, since we stop while backgrounded.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const current = job;
      if (
        state === "active" &&
        current &&
        !isTerminalStatus(current.status) &&
        timerRef.current === null &&
        !cancelledRef.current
      ) {
        void pollOnce(current.id);
      }
    });
    return () => subscription.remove();
  }, [job, pollOnce]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearTimer();
    };
  }, [clearTimer]);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    setPhase("idle");
    setJob(null);
    setUploadProgress(0);
    setError(null);
    setOutputUri(null);
  }, [clearTimer]);

  return { phase, job, uploadProgress, error, outputUri, start, reset };
}
