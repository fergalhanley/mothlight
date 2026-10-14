import { test, expect } from "bun:test";
import { parseShotMarkdown, normalizedHeading } from "../src/server/shot-markdown";

const sample = [
  "# Example",
  "## Scene 01 — INT. ALTAIR RESIDENCE — RECEPTION - NIGHT",
  "*Beat: party*",
  "### 01.01 · 5s · Slow push",
  "**Title:** Family portrait",
  "**Action:** Camera moves toward the photograph.",
  "**Sound/dialogue:** Guests laughing.",
  "**Continuity/assets:** One canonical photo.",
  "### 01.02 · 6.5s · Close-up, static",
  "**Action:** Ryan looks away.",
  "**Sound/dialogue:** RYAN: 'Enough.'",
  "## Scene 02 — INT. ALTAIR RESIDENCE - RECEPTION - NIGHT",
  "### 02.01 · 7s · Medium",
  "**Action:** Ryan returns.",
  "## World library",
  "### Characters",
  "- Ryan",
].join("\n");

test("shot Markdown parses titled shots, durations, audio and continuity; ignores world notes", () => {
  const scenes = parseShotMarkdown(sample);
  expect(scenes).toHaveLength(2);
  expect(scenes[0].shots).toHaveLength(2);
  expect(scenes[0].shots[0]).toEqual({
    title: "Family portrait",
    action: "Camera moves toward the photograph.",
    dialogue: "Guests laughing.",
    camera: "Slow push",
    continuity: "One canonical photo.",
    duration: 5,
  });
  expect(scenes[0].shots[1].duration).toBe(6.5);
  expect(scenes[1].shots[0].title).toBe("Ryan returns");
  expect(normalizedHeading(scenes[0].heading)).toBe(normalizedHeading(scenes[1].heading));
});

test("shot Markdown rejects unsafe or ambiguous inputs", () => {
  expect(() => parseShotMarkdown("not a breakdown")).toThrow("No numbered scenes");
  expect(() => parseShotMarkdown(sample.replace("01.02", "01.03"))).toThrow("sequential");
  expect(() => parseShotMarkdown(sample.replace("6.5s", "0s"))).toThrow("duration");
  expect(() => parseShotMarkdown(sample.replace("**Action:** Camera moves toward the photograph.", ""))).toThrow("Action");
  expect(() => parseShotMarkdown(sample.replace("## Scene 02", "## Scene 01"))).toThrow("Duplicate");
});
