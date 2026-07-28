import { describe, expect, test } from "bun:test";
import { buildCaptionCues, captionAnchorY, cueAt } from "./captions";

describe("buildCaptionCues", () => {
  test("groups words into cues of the requested size", () => {
    const cues = buildCaptionCues("one two three four five six", 6000, 3);
    expect(cues.map((cue) => cue.text)).toEqual(["one two three", "four five six"]);
  });

  test("distributes cues evenly across the segment", () => {
    const cues = buildCaptionCues("one two three four", 4000, 2);
    expect(cues[0]).toMatchObject({ startMs: 0, endMs: 2000 });
    expect(cues[1]).toMatchObject({ startMs: 2000, endMs: 4000 });
  });

  test("the last cue absorbs rounding so captions cover the whole segment", () => {
    const cues = buildCaptionCues("a b c", 1000, 1);
    expect(cues).toHaveLength(3);
    expect(cues.at(-1)?.endMs).toBe(1000);
  });

  test("a trailing partial group still becomes a cue", () => {
    const cues = buildCaptionCues("one two three four five", 5000, 2);
    expect(cues.map((cue) => cue.text)).toEqual(["one two", "three four", "five"]);
  });

  test("collapses irregular whitespace", () => {
    const cues = buildCaptionCues("  one   two\n\nthree  ", 3000, 4);
    expect(cues[0]?.text).toBe("one two three");
  });

  test.each([
    ["", 5000, 4],
    ["   ", 5000, 4],
    ["words here", 0, 4],
  ])("returns no cues for (%p, %i)", (script, durationMs, wordsPerCue) => {
    expect(buildCaptionCues(script, durationMs, wordsPerCue)).toEqual([]);
  });

  test("a zero or negative wordsPerCue does not hang or produce empty cues", () => {
    const cues = buildCaptionCues("one two three", 3000, 0);
    expect(cues).toHaveLength(3);
    expect(cues.every((cue) => cue.text.length > 0)).toBe(true);
  });
});

describe("cueAt", () => {
  const cues = buildCaptionCues("one two three four", 4000, 2);

  test.each([
    [0, "one two"],
    [1999, "one two"],
    [2000, "three four"],
    [3999, "three four"],
  ])("at %ims shows %s", (positionMs, expected) => {
    expect(cueAt(cues, positionMs)?.text).toBe(expected);
  });

  test("returns null past the end", () => {
    expect(cueAt(cues, 4000)).toBeNull();
  });
});

describe("captionAnchorY", () => {
  test("lower-third sits near the bottom, upper-third near the top", () => {
    expect(captionAnchorY("upper-third")).toBeLessThan(captionAnchorY("center"));
    expect(captionAnchorY("center")).toBeLessThan(captionAnchorY("lower-third"));
  });
});
