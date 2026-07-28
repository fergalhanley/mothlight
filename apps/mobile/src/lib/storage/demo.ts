import {
  createId,
  createUuid,
  DEFAULT_CANVAS,
  DEFAULT_CAPTION_STYLE,
  DEFAULT_SOUNDTRACK,
  PROJECT_SCHEMA_VERSION,
  type Project,
  type Segment,
  segmentSchema,
} from "@mothlight/core";
import { loadPrefs, markDemoSeeded } from "./prefs";
import { saveProject } from "./projects";

/**
 * The demo project, seeded once on first launch.
 *
 * This is the single highest-value thing in v0: it is what an App Review tester opens,
 * and what a new user learns the app from. It has to make sense with zero explanation.
 *
 * ---------------------------------------------------------------------------------
 * NOT FINISHED: the segments below use solid-colour visuals because no bundled media
 * exists in the repo yet. §2.1 calls for bundled images, a bundled voiceover, and a
 * bundled music bed. Once those land (music is blocked on the ElevenLabs licence check
 * in §4), replace the `visual.main` entries with image assets and add the vo/soundtrack
 * asset references — the seeding mechanism itself does not change, only this data.
 * ---------------------------------------------------------------------------------
 */

const DEMO_NAME = "Mothlight — 30 second tour";

type DemoSegment = {
  script: string;
  color: string;
  overlay?: string;
};

/** Four beats: what it is, how it works, what it makes, what to do next. */
const DEMO_SEGMENTS: DemoSegment[] = [
  {
    script: "This is Mothlight. Short videos, made on your phone.",
    color: "#1B1F3B",
    overlay: "Mothlight",
  },
  {
    script: "Every video is a list of segments. Each one gets a picture and a line.",
    color: "#2B1B3B",
  },
  {
    script: "Record a voiceover, turn on captions, pick a soundtrack.",
    color: "#3B1B2B",
  },
  {
    script: "Then render it, and it lands in your camera roll. Tap Render to try it.",
    color: "#3B2B1B",
    overlay: "Tap Render",
  },
];

function buildSegment(demo: DemoSegment): Segment {
  return segmentSchema.parse({
    id: createId("seg"),
    script: demo.script,
    // Explicit so the tour runs at a predictable length rather than the 3s floor.
    durationMode: "manual",
    durationMs: 5000,
    captionsEnabled: true,
    visual: {
      main: {
        type: "color",
        color: demo.color,
        fit: "cover",
      },
      overlays: demo.overlay
        ? [
            {
              id: createId("ov"),
              type: "text",
              text: demo.overlay,
              x: 0.5,
              y: 0.22,
              style: { font: "Inter-Bold", sizePt: 64, color: "#FFFFFF" },
            },
          ]
        : [],
    },
  });
}

export function buildDemoProject(): Project {
  const now = new Date().toISOString();

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createUuid(),
    name: DEMO_NAME,
    createdAt: now,
    updatedAt: now,
    canvas: { ...DEFAULT_CANVAS },
    captionStyle: { ...DEFAULT_CAPTION_STYLE, enabled: true },
    soundtrack: { ...DEFAULT_SOUNDTRACK },
    segments: DEMO_SEGMENTS.map(buildSegment),
    assets: [],
  };
}

/**
 * Seeds the demo on first launch only.
 *
 * Deliberately never resurrected: a user who deletes the tour has said they are done
 * with it, and having it reappear would be obnoxious. That is also the only route to
 * the dashboard's empty state.
 */
export async function seedDemoProjectIfNeeded(): Promise<Project | null> {
  const prefs = await loadPrefs();
  if (prefs.hasSeededDemo) return null;

  const project = await saveProject(buildDemoProject());
  await markDemoSeeded();
  return project;
}
