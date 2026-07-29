import {
  buildCaptionCues,
  captionAnchorY,
  cueAt,
  type Project,
  resolveCaptionsEnabled,
  resolveSegmentDurationMs,
  resolveSegmentStartsMs,
  type Segment,
} from "@mothlight/core";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * The video itself.
 *
 * Every timing decision here comes from @mothlight/core — the same functions the in-app
 * preview uses. That is the point of putting them there: the preview and the render
 * cannot disagree about how long a segment runs or which caption is on screen, because
 * neither owns that logic.
 */

export type MothlightVideoProps = {
  project: Project;
  /** assetId -> a path the renderer can load (file:// or http://). */
  assetSources: Record<string, string>;
};

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

/** Ken Burns: a slow push or pull across the segment. Subtle by design. */
function useKenBurnsScale(enabled: boolean, direction: string, durationInFrames: number): number {
  const frame = useCurrentFrame();
  if (!enabled) return 1;

  const [from, to] = direction === "zoom-out" ? [1.12, 1] : [1, 1.12];
  return interpolate(frame, [0, durationInFrames], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function SegmentVisual({
  segment,
  assetSources,
  durationInFrames,
}: {
  segment: Segment;
  assetSources: Record<string, string>;
  durationInFrames: number;
}) {
  const main = segment.visual.main;
  const scale = useKenBurnsScale(
    main?.type === "image" && main.kenBurns.enabled,
    main?.kenBurns.to ?? "zoom-in",
    durationInFrames,
  );

  if (!main) return <AbsoluteFill style={{ backgroundColor: "#000000" }} />;

  if (main.type === "color") {
    return <AbsoluteFill style={{ backgroundColor: main.color ?? "#000000" }} />;
  }

  const src = main.assetId ? assetSources[main.assetId] : undefined;
  if (!src) return <AbsoluteFill style={{ backgroundColor: "#000000" }} />;

  const objectFit = main.fit === "contain" ? "contain" : "cover";

  if (main.type === "video") {
    return (
      <AbsoluteFill>
        {/* OffthreadVideo is the one to use when rendering — it extracts frames rather
            than relying on a <video> element keeping up with the render loop. */}
        <OffthreadVideo
          src={src}
          startFrom={main.trimStartMs > 0 ? msToFrames(main.trimStartMs, 30) : undefined}
          muted={main.muteSourceAudio}
          style={{ height: "100%", objectFit, width: "100%" }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          height: "100%",
          objectFit,
          transform: `scale(${scale})`,
          width: "100%",
        }}
      />
    </AbsoluteFill>
  );
}

function Captions({
  segment,
  project,
  segmentDurationMs,
}: {
  segment: Segment;
  project: Project;
  segmentDurationMs: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!resolveCaptionsEnabled(segment, project)) return null;

  const cues = buildCaptionCues(
    segment.script,
    segmentDurationMs,
    project.captionStyle.wordsPerCue,
  );
  const cue = cueAt(cues, (frame / fps) * 1000);
  if (!cue) return null;

  const style = project.captionStyle;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: `${captionAnchorY(style.position) * 100}%`,
        paddingLeft: 64,
        paddingRight: 64,
      }}
    >
      <span
        style={{
          color: style.color,
          fontFamily: "Inter, Helvetica, Arial, sans-serif",
          fontSize: style.sizePt,
          fontWeight: 700,
          lineHeight: 1.2,
          textAlign: "center",
          // A stroke rather than a shadow: legible over any footage.
          WebkitTextStroke: `6px ${style.strokeColor}`,
          paintOrder: "stroke fill",
        }}
      >
        {cue.text}
      </span>
    </AbsoluteFill>
  );
}

function Overlays({ segment }: { segment: Segment }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  return (
    <>
      {segment.visual.overlays.map((overlay) => {
        const visible =
          nowMs >= overlay.startMs && (overlay.endMs === null || nowMs < overlay.endMs);
        if (!visible || overlay.type !== "text" || !overlay.text) return null;

        return (
          <AbsoluteFill key={overlay.id} style={{ pointerEvents: "none" }}>
            <span
              style={{
                color: overlay.style.color,
                fontFamily: "Inter, Helvetica, Arial, sans-serif",
                fontSize: overlay.style.sizePt,
                fontWeight: 700,
                left: `${overlay.x * 100}%`,
                position: "absolute",
                textAlign: "center",
                top: `${overlay.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg) scale(${overlay.scale})`,
                whiteSpace: "pre",
              }}
            >
              {overlay.text}
            </span>
          </AbsoluteFill>
        );
      })}
    </>
  );
}

export function MothlightVideo({ project, assetSources }: MothlightVideoProps) {
  const { fps } = useVideoConfig();
  const starts = resolveSegmentStartsMs(project);

  const soundtrackSrc = project.soundtrack.assetId
    ? assetSources[project.soundtrack.assetId]
    : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {project.segments.map((segment, index) => {
        const segmentDurationMs = resolveSegmentDurationMs(segment, project.assets);
        const durationInFrames = msToFrames(segmentDurationMs, fps);
        const from = msToFrames(starts[index] ?? 0, fps) - (index === 0 ? 1 : 0);

        const voSrc = segment.audio.vo ? assetSources[segment.audio.vo.assetId] : undefined;

        return (
          <Sequence
            key={segment.id}
            from={Math.max(0, from)}
            durationInFrames={durationInFrames}
            name={`Segment ${index + 1}`}
          >
            <SegmentVisual
              segment={segment}
              assetSources={assetSources}
              durationInFrames={durationInFrames}
            />
            <Overlays segment={segment} />
            <Captions segment={segment} project={project} segmentDurationMs={segmentDurationMs} />
            {voSrc && segment.audio.vo ? (
              <Audio
                src={voSrc}
                volume={dbToGain(segment.audio.vo.gainDb)}
                trimBefore={
                  segment.audio.vo.trimStartMs > 0
                    ? msToFrames(segment.audio.vo.trimStartMs, fps)
                    : undefined
                }
              />
            ) : null}
          </Sequence>
        );
      })}

      {soundtrackSrc ? (
        <Audio src={soundtrackSrc} volume={dbToGain(project.soundtrack.gainDb)} loop />
      ) : null}
    </AbsoluteFill>
  );
}

/** Gain in dB to Remotion's 0–1 linear volume. */
function dbToGain(db: number): number {
  return Math.min(1, Math.max(0, 10 ** (db / 20)));
}
