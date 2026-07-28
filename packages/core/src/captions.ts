import type { CaptionStyle } from "./project";

/**
 * Turning a segment's script into timed caption cues.
 *
 * v0 has no word-level timing — there is no speech alignment — so cues are distributed
 * evenly across the segment. That is honest for short segments where the voiceover
 * matches the script, which is the case Mothlight is built around. Real alignment is a
 * later problem, and this function is the seam for it.
 */

export type CaptionCue = {
  text: string;
  startMs: number;
  endMs: number;
};

/** Splits on whitespace, preserving punctuation attached to words. */
function toWords(script: string): string[] {
  return script.trim().split(/\s+/).filter(Boolean);
}

export function buildCaptionCues(
  script: string,
  durationMs: number,
  wordsPerCue: number,
): CaptionCue[] {
  const words = toWords(script);
  if (words.length === 0 || durationMs <= 0) return [];

  const perCue = Math.max(1, Math.floor(wordsPerCue));
  const groups: string[][] = [];
  for (let index = 0; index < words.length; index += perCue) {
    groups.push(words.slice(index, index + perCue));
  }

  const cueDuration = durationMs / groups.length;

  return groups.map((group, index) => ({
    text: group.join(" "),
    startMs: Math.round(index * cueDuration),
    // The last cue absorbs any rounding drift so captions cover the whole segment.
    endMs: index === groups.length - 1 ? durationMs : Math.round((index + 1) * cueDuration),
  }));
}

/** The cue visible at a given offset into the segment, if any. */
export function cueAt(cues: CaptionCue[], positionMs: number): CaptionCue | null {
  return cues.find((cue) => positionMs >= cue.startMs && positionMs < cue.endMs) ?? null;
}

/** Vertical placement as a fraction of canvas height, for the renderer and the preview. */
export function captionAnchorY(position: CaptionStyle["position"]): number {
  switch (position) {
    case "upper-third":
      return 0.25;
    case "center":
      return 0.5;
    default:
      return 0.78;
  }
}
