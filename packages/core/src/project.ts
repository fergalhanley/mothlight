import { z } from "zod";
import { createId, createUuid } from "./ids";

/**
 * The `project.json` format — Mothlight's import/export contract and the target for the
 * agent script-writing skill.
 *
 * Two properties matter and are load-bearing:
 *
 * 1. **Versioned from day one.** `schemaVersion` is checked before anything else so a
 *    file from a newer build fails with a sentence a human can act on.
 * 2. **Lenient on input, canonical on output.** Almost every field has a default, so an
 *    agent can emit nothing but segment scripts and still produce a valid project.
 *    Parsing always yields a fully-populated object, which means the rest of the app
 *    never has to reason about absent fields.
 */

export const PROJECT_SCHEMA_VERSION = "0.1";

// --- Canvas ---------------------------------------------------------------------------

/** v0 renders exactly one aspect ratio. Others are v0.2. */
export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;
export const CANVAS_FPS = 30;

export const DEFAULT_CANVAS = {
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  fps: CANVAS_FPS,
};

export const canvasSchema = z.object({
  width: z.number().int().positive().default(CANVAS_WIDTH),
  height: z.number().int().positive().default(CANVAS_HEIGHT),
  fps: z.number().int().positive().default(CANVAS_FPS),
});

// --- Durations ------------------------------------------------------------------------

/** A still with no voiceover holds for this long. */
export const MIN_SEGMENT_DURATION_MS = 3000;
/** Soft cap — the editor warns past this. */
export const SOFT_MAX_PROJECT_DURATION_MS = 90_000;
/** Hard cap — the editor refuses past this, to keep render time and memory sane. */
export const HARD_MAX_PROJECT_DURATION_MS = 180_000;

// --- Shared primitives ----------------------------------------------------------------

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "must be a 6-digit hex colour such as #FFCC00");

/** Normalised 0–1 canvas coordinate; the anchor is the centre of the element. */
const normalisedCoordSchema = z.number().min(0).max(1);

const nonNegativeMsSchema = z.number().int().nonnegative();

// --- Caption style --------------------------------------------------------------------

export const captionPositionSchema = z.enum(["upper-third", "center", "lower-third"]);
export type CaptionPosition = z.infer<typeof captionPositionSchema>;

export const DEFAULT_CAPTION_STYLE = {
  enabled: true,
  font: "Inter-Bold",
  sizePt: 48,
  color: "#FFFFFF",
  strokeColor: "#000000",
  position: "lower-third" as CaptionPosition,
  wordsPerCue: 4,
};

export const captionStyleSchema = z.object({
  /** Project-level default; individual segments may override it. */
  enabled: z.boolean().default(DEFAULT_CAPTION_STYLE.enabled),
  font: z.string().min(1).default(DEFAULT_CAPTION_STYLE.font),
  sizePt: z.number().positive().default(DEFAULT_CAPTION_STYLE.sizePt),
  color: hexColorSchema.default(DEFAULT_CAPTION_STYLE.color),
  strokeColor: hexColorSchema.default(DEFAULT_CAPTION_STYLE.strokeColor),
  position: captionPositionSchema.default(DEFAULT_CAPTION_STYLE.position),
  wordsPerCue: z.number().int().positive().max(12).default(DEFAULT_CAPTION_STYLE.wordsPerCue),
});
export type CaptionStyle = z.infer<typeof captionStyleSchema>;

// --- Soundtrack -----------------------------------------------------------------------

export const DEFAULT_SOUNDTRACK = {
  assetId: null,
  gainDb: -18,
  duckUnderVo: true,
  fadeOutMs: 1500,
};

/** Background music is project-level in v0. Per-segment music is deliberately not a thing. */
export const soundtrackSchema = z.object({
  assetId: z.string().min(1).nullable().default(null),
  gainDb: z.number().min(-60).max(12).default(DEFAULT_SOUNDTRACK.gainDb),
  duckUnderVo: z.boolean().default(DEFAULT_SOUNDTRACK.duckUnderVo),
  fadeOutMs: nonNegativeMsSchema.default(DEFAULT_SOUNDTRACK.fadeOutMs),
});
export type Soundtrack = z.infer<typeof soundtrackSchema>;

// --- Visual ---------------------------------------------------------------------------

export const kenBurnsFromSchema = z.enum(["center", "top", "bottom", "left", "right"]);
export const kenBurnsToSchema = z.enum([
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
]);

export const kenBurnsSchema = z.object({
  enabled: z.boolean().default(false),
  from: kenBurnsFromSchema.default("center"),
  to: kenBurnsToSchema.default("zoom-in"),
});

export const visualMainTypeSchema = z.enum(["image", "video", "color"]);
export type VisualMainType = z.infer<typeof visualMainTypeSchema>;

/**
 * Kept as one flat object rather than a discriminated union: the editor mutates
 * individual fields in place and switching `type` should not discard the rest. Coherence
 * between `type` and the fields it requires is enforced below instead.
 */
export const visualMainSchema = z
  .object({
    type: visualMainTypeSchema,
    assetId: z.string().min(1).nullable().default(null),
    fit: z.enum(["cover", "contain"]).default("cover"),
    /** Used when `type` is "color". */
    color: hexColorSchema.nullable().default(null),
    /** Video only. */
    trimStartMs: nonNegativeMsSchema.default(0),
    /** Video only; null means "to the end of the clip". */
    trimEndMs: nonNegativeMsSchema.nullable().default(null),
    muteSourceAudio: z.boolean().default(true),
    kenBurns: kenBurnsSchema.default(() => ({ ...kenBurnsSchema.parse({}) })),
  })
  .superRefine((main, ctx) => {
    if ((main.type === "image" || main.type === "video") && !main.assetId) {
      ctx.addIssue({
        code: "custom",
        path: ["assetId"],
        message: `is required when the visual type is "${main.type}"`,
      });
    }
    if (main.type === "color" && !main.color) {
      ctx.addIssue({
        code: "custom",
        path: ["color"],
        message: 'is required when the visual type is "color"',
      });
    }
    if (main.trimEndMs !== null && main.trimEndMs <= main.trimStartMs) {
      ctx.addIssue({
        code: "custom",
        path: ["trimEndMs"],
        message: "must be greater than trimStartMs",
      });
    }
  });
export type VisualMain = z.infer<typeof visualMainSchema>;

export const overlayTypeSchema = z.enum(["text", "image", "drawing"]);
export type OverlayType = z.infer<typeof overlayTypeSchema>;

export const DEFAULT_OVERLAY_STYLE = {
  font: "Inter-Bold",
  sizePt: 64,
  color: "#FFFFFF",
};

export const overlayStyleSchema = z.object({
  font: z.string().min(1).default(DEFAULT_OVERLAY_STYLE.font),
  sizePt: z.number().positive().default(DEFAULT_OVERLAY_STYLE.sizePt),
  color: hexColorSchema.default(DEFAULT_OVERLAY_STYLE.color),
});

export const overlaySchema = z
  .object({
    id: z
      .string()
      .min(1)
      .default(() => createId("ov")),
    type: overlayTypeSchema.default("text"),
    text: z.string().nullable().default(null),
    /** Set for "image" and "drawing" overlays. */
    assetId: z.string().min(1).nullable().default(null),
    x: normalisedCoordSchema.default(0.5),
    y: normalisedCoordSchema.default(0.5),
    scale: z.number().positive().default(1),
    rotation: z.number().default(0),
    style: overlayStyleSchema.default(() => ({ ...DEFAULT_OVERLAY_STYLE })),
    startMs: nonNegativeMsSchema.default(0),
    /** null means "to the end of the segment". */
    endMs: nonNegativeMsSchema.nullable().default(null),
  })
  .superRefine((overlay, ctx) => {
    if (overlay.type === "text" && !overlay.text?.trim()) {
      ctx.addIssue({ code: "custom", path: ["text"], message: "is required for a text overlay" });
    }
    if (overlay.type !== "text" && !overlay.assetId) {
      ctx.addIssue({
        code: "custom",
        path: ["assetId"],
        message: `is required for a "${overlay.type}" overlay`,
      });
    }
    if (overlay.endMs !== null && overlay.endMs <= overlay.startMs) {
      ctx.addIssue({ code: "custom", path: ["endMs"], message: "must be greater than startMs" });
    }
  });
export type Overlay = z.infer<typeof overlaySchema>;

export const visualSchema = z.object({
  /** null means "needs a visual" — the state an agent-authored script starts in. */
  main: visualMainSchema.nullable().default(null),
  overlays: z.array(overlaySchema).default(() => []),
  /** Reserved. Present in the schema, deliberately not rendered or shown in v0. */
  effects: z.array(z.unknown()).default(() => []),
});
export type Visual = z.infer<typeof visualSchema>;

// --- Audio ----------------------------------------------------------------------------

export const voiceoverSchema = z.object({
  assetId: z.string().min(1),
  gainDb: z.number().min(-60).max(12).default(0),
  trimStartMs: nonNegativeMsSchema.default(0),
});
export type Voiceover = z.infer<typeof voiceoverSchema>;

export const segmentAudioSchema = z.object({
  vo: voiceoverSchema.nullable().default(null),
  /** Reserved. Present in the schema, deliberately not rendered or shown in v0. */
  sfx: z.array(z.unknown()).default(() => []),
});
export type SegmentAudio = z.infer<typeof segmentAudioSchema>;

// --- Segment --------------------------------------------------------------------------

export const durationModeSchema = z.enum(["auto", "manual"]);
export type DurationMode = z.infer<typeof durationModeSchema>;

export const segmentSchema = z.object({
  id: z
    .string()
    .min(1)
    .default(() => createId("seg")),
  durationMode: durationModeSchema.default("auto"),
  /** Computed when the mode is "auto", authoritative when "manual". */
  durationMs: nonNegativeMsSchema.default(MIN_SEGMENT_DURATION_MS),
  script: z.string().default(""),
  /**
   * Per-segment override of `captionStyle.enabled`.
   *
   * null means "inherit the project default", which is what an agent-authored file that
   * omits the field should get. A literal boolean wins over the project setting.
   */
  captionsEnabled: z.boolean().nullable().default(null),
  visual: visualSchema.default(() => visualSchema.parse({})),
  audio: segmentAudioSchema.default(() => segmentAudioSchema.parse({})),
});
export type Segment = z.infer<typeof segmentSchema>;

// --- Assets ---------------------------------------------------------------------------

export const assetKindSchema = z.enum(["image", "video", "audio"]);
export type AssetKind = z.infer<typeof assetKindSchema>;

export const assetSourceSchema = z.enum(["photo-library", "files", "recording", "bundled"]);
export type AssetSource = z.infer<typeof assetSourceSchema>;

export const assetSchema = z.object({
  id: z.string().min(1),
  kind: assetKindSchema,
  /** Relative to the project directory on disk; absolute once resolved at runtime. */
  uri: z.string().min(1),
  source: assetSourceSchema,
  originalFilename: z.string().nullable().default(null),
  durationMs: nonNegativeMsSchema.nullable().default(null),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
});
export type Asset = z.infer<typeof assetSchema>;

// --- Project --------------------------------------------------------------------------

export const projectSchema = z.object({
  schemaVersion: z.string().min(1).default(PROJECT_SCHEMA_VERSION),
  id: z
    .string()
    .min(1)
    .default(() => createUuid()),
  name: z.string().min(1, "cannot be empty").default("Untitled project"),
  createdAt: z.iso.datetime({ offset: true }).default(() => new Date().toISOString()),
  updatedAt: z.iso.datetime({ offset: true }).default(() => new Date().toISOString()),
  canvas: canvasSchema.default(() => ({ ...DEFAULT_CANVAS })),
  captionStyle: captionStyleSchema.default(() => ({ ...DEFAULT_CAPTION_STYLE })),
  soundtrack: soundtrackSchema.default(() => ({ ...DEFAULT_SOUNDTRACK })),
  segments: z.array(segmentSchema).default(() => []),
  /** Absent in an agent-authored script — that is the intended workflow, not an error. */
  assets: z.array(assetSchema).default(() => []),
});
export type Project = z.infer<typeof projectSchema>;
