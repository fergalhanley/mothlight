import { type Project, resolveProjectDurationMs, resolveSegmentStartsMs } from "@mothlight/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The single clock that drives preview playback.
 *
 * §2.4 is explicit that this does not need to be frame-perfect — it needs to be honest
 * about order, timing, and content. So one requestAnimationFrame loop advances a
 * position in milliseconds using real elapsed time, and every layer (visual, overlays,
 * captions, audio) derives what it shows from that one number. Nothing keeps its own
 * clock, which is what stops the layers drifting apart.
 */

export type PreviewPlayback = {
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  /** Index of the segment under the playhead, or -1 when the project is empty. */
  activeIndex: number;
  /** Offset into that segment. */
  offsetMs: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (positionMs: number) => void;
  /** Jumps the playhead to the start of a segment — used when a card is expanded. */
  seekToSegment: (segmentId: string) => void;
};

export function usePreviewPlayback(project: Project | null): PreviewPlayback {
  const [positionMs, setPositionMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  const durationMs = useMemo(() => (project ? resolveProjectDurationMs(project) : 0), [project]);
  const starts = useMemo(() => (project ? resolveSegmentStartsMs(project) : []), [project]);

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    lastTickRef.current = null;
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      stopLoop();
      return;
    }

    const tick = (timestamp: number) => {
      const last = lastTickRef.current;
      lastTickRef.current = timestamp;

      if (last !== null) {
        const elapsed = timestamp - last;
        setPositionMs((current) => {
          const next = current + elapsed;
          if (next >= durationMs) {
            // Stop at the end rather than looping — this is a preview, not a player.
            setIsPlaying(false);
            return durationMs;
          }
          return next;
        });
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [isPlaying, durationMs, stopLoop]);

  // Editing can shorten the project under the playhead.
  useEffect(() => {
    setPositionMs((current) => (current > durationMs ? durationMs : current));
  }, [durationMs]);

  const play = useCallback(() => {
    if (durationMs <= 0) return;
    // Replay from the top if the playhead is parked at the end.
    setPositionMs((current) => (current >= durationMs ? 0 : current));
    setIsPlaying(true);
  }, [durationMs]);

  const pause = useCallback(() => setIsPlaying(false), []);
  const toggle = useCallback(() => (isPlaying ? pause() : play()), [isPlaying, pause, play]);

  const seek = useCallback(
    (next: number) => {
      setPositionMs(Math.max(0, Math.min(next, durationMs)));
      lastTickRef.current = null;
    },
    [durationMs],
  );

  const seekToSegment = useCallback(
    (segmentId: string) => {
      if (!project) return;
      const index = project.segments.findIndex((segment) => segment.id === segmentId);
      const start = starts[index];
      if (index === -1 || start === undefined) return;
      seek(start);
    },
    [project, starts, seek],
  );

  const { activeIndex, offsetMs } = useMemo(() => {
    if (starts.length === 0) return { activeIndex: -1, offsetMs: 0 };

    // Walk backwards: the active segment is the last one that has started.
    for (let index = starts.length - 1; index >= 0; index--) {
      const start = starts[index];
      if (start !== undefined && positionMs >= start) {
        return { activeIndex: index, offsetMs: positionMs - start };
      }
    }
    return { activeIndex: 0, offsetMs: positionMs };
  }, [starts, positionMs]);

  return {
    positionMs,
    durationMs,
    isPlaying,
    activeIndex,
    offsetMs,
    play,
    pause,
    toggle,
    seek,
    seekToSegment,
  };
}
