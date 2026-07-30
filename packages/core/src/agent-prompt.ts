import { CANVAS_FPS, CANVAS_HEIGHT, CANVAS_WIDTH, PROJECT_SCHEMA_VERSION } from "./project";

/**
 * The prompt a user hands to their own AI agent to get a Mothlight project back.
 *
 * This is the whole agent workflow in one copyable block: the agent writes structure and
 * words, the human adds pictures. It deliberately shows the *minimum* valid file rather
 * than the full schema — almost every field has a default, and a wall of optional keys
 * would make the format look harder than it is.
 */
export const AGENT_PROMPT = `Write a short-form video script as a Mothlight project file.

Return ONLY a JSON object, no prose and no code fences, in this shape:

{
  "schemaVersion": "${PROJECT_SCHEMA_VERSION}",
  "name": "<a short title for the video>",
  "segments": [
    { "script": "<one or two spoken sentences>" },
    { "script": "<the next beat>" }
  ]
}

Rules:
- One shot per beat of the story. Aim for 4-8 shots.
- Each "script" is what a narrator says out loud over that shot. Keep it to one or
  two sentences — roughly 3-6 seconds of speech.
- Write for the ear, not the page: short sentences, plain words, no headings or
  bullet points inside a script.
- Do not invent image, video, or audio fields. The human adds the pictures.
- The whole video should run about 30-60 seconds.

Topic: <describe your video here>`;

/** Shown alongside the prompt so the format is legible without reading the schema. */
export const AGENT_NOTES = [
  `Shots play in order on a ${CANVAS_WIDTH}×${CANVAS_HEIGHT} canvas at ${CANVAS_FPS}fps.`,
  "A shot with no visual shows as “needs a visual” in the editor — that is the point.",
  "Everything else has a sensible default, so a file with just names and scripts is valid.",
  "Save the result as a .json file and open it with Mothlight, or import it here.",
];
