import {
  buildCaptionCues,
  captionAnchorY,
  cueAt,
  formatDurationMs,
  type Project,
  resolveCaptionsEnabled,
  resolveSegmentDurationMs,
} from "@mothlight/core";
import { Image } from "expo-image";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PreviewPlayback } from "@/lib/editor/usePreviewPlayback";
import { theme } from "@/lib/theme";

/**
 * The 9:16 preview.
 *
 * Every layer derives from the playback clock's single position value, so the picture,
 * overlays, and captions cannot drift apart. Video frames are not scrubbed in v0 — a
 * video segment shows its poster while the clock runs, which keeps the preview honest
 * about order and timing without pretending to be a compositor.
 */
export function PreviewCanvas({
  project,
  playback,
  resolveUri,
}: {
  project: Project;
  playback: PreviewPlayback;
  resolveUri: (uri: string) => string;
}) {
  const segment = playback.activeIndex >= 0 ? project.segments[playback.activeIndex] : undefined;

  const main = segment?.visual.main ?? null;
  const asset = main?.assetId
    ? project.assets.find((candidate) => candidate.id === main.assetId)
    : undefined;

  const segmentDurationMs = useMemo(
    () => (segment ? resolveSegmentDurationMs(segment, project.assets) : 0),
    [segment, project.assets],
  );

  const caption = useMemo(() => {
    if (!segment || !resolveCaptionsEnabled(segment, project)) return null;
    const cues = buildCaptionCues(
      segment.script,
      segmentDurationMs,
      project.captionStyle.wordsPerCue,
    );
    return cueAt(cues, playback.offsetMs);
  }, [segment, project, segmentDurationMs, playback.offsetMs]);

  const progress = playback.durationMs > 0 ? playback.positionMs / playback.durationMs : 0;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityLabel={playback.isPlaying ? "Pause preview" : "Play preview"}
        accessibilityRole="button"
        onPress={playback.toggle}
        style={styles.canvas}
      >
        {main?.type === "color" ? (
          <View style={[styles.fill, { backgroundColor: main.color ?? "#000000" }]} />
        ) : asset ? (
          <Image
            source={{ uri: resolveUri(asset.uri) }}
            style={styles.fill}
            contentFit={main?.fit === "contain" ? "contain" : "cover"}
            transition={100}
          />
        ) : (
          <View style={[styles.fill, styles.emptyFill]}>
            <Text style={styles.emptyLabel}>
              {project.segments.length === 0 ? "Add a segment" : "This segment needs a visual"}
            </Text>
          </View>
        )}

        {segment?.visual.overlays.map((overlay) => {
          const visible =
            playback.offsetMs >= overlay.startMs &&
            (overlay.endMs === null || playback.offsetMs < overlay.endMs);
          if (!visible || overlay.type !== "text" || !overlay.text) return null;

          return (
            <Text
              key={overlay.id}
              style={[
                styles.overlayText,
                {
                  left: `${overlay.x * 100}%`,
                  top: `${overlay.y * 100}%`,
                  color: overlay.style.color,
                  // Preview canvas is a fraction of the 1080-wide render canvas, so
                  // point sizes are scaled to keep the composition believable.
                  fontSize: overlay.style.sizePt * PREVIEW_SCALE * overlay.scale,
                  transform: [{ translateX: -1000 }, { rotate: `${overlay.rotation}deg` }],
                },
              ]}
            >
              {overlay.text}
            </Text>
          );
        })}

        {caption ? (
          <View
            style={[
              styles.captionRow,
              { top: `${captionAnchorY(project.captionStyle.position) * 100}%` },
            ]}
          >
            <Text
              style={[
                styles.caption,
                {
                  color: project.captionStyle.color,
                  fontSize: project.captionStyle.sizePt * PREVIEW_SCALE,
                },
              ]}
            >
              {caption.text}
            </Text>
          </View>
        ) : null}

        {!playback.isPlaying ? (
          <View style={styles.playBadge}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        ) : null}
      </Pressable>

      <View style={styles.scrubRow}>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={playback.toggle}>
          <Text style={styles.transport}>{playback.isPlaying ? "❚❚" : "▶"}</Text>
        </Pressable>

        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${Math.min(progress, 1) * 100}%` }]} />
        </View>

        <Text style={styles.time}>{formatDurationMs(playback.positionMs)}</Text>
      </View>
    </View>
  );
}

/**
 * Preview width over render width (1080). Caption and overlay point sizes are authored
 * against the render canvas, so they must be scaled down to look right here.
 */
const PREVIEW_SCALE = 146 / 1080;

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", gap: 8 },
  canvas: {
    aspectRatio: 9 / 16,
    backgroundColor: "#000",
    borderRadius: 12,
    maxHeight: 260,
    overflow: "hidden",
  },
  fill: { height: "100%", width: "100%" },
  emptyFill: {
    alignItems: "center",
    backgroundColor: theme.surface,
    justifyContent: "center",
    padding: 16,
  },
  emptyLabel: { color: theme.textMuted, fontSize: 12, textAlign: "center" },
  overlayText: {
    fontWeight: "700",
    position: "absolute",
    textAlign: "center",
    // Centres the label on its anchor point; paired with the translateX above.
    width: 2000,
  },
  captionRow: {
    alignItems: "center",
    left: 0,
    paddingHorizontal: 8,
    position: "absolute",
    right: 0,
  },
  caption: {
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  playBadge: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    left: "50%",
    marginLeft: -24,
    marginTop: -24,
    position: "absolute",
    top: "50%",
    width: 48,
  },
  playIcon: { color: "#fff", fontSize: 16 },
  scrubRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    width: "100%",
  },
  transport: { color: theme.text, fontSize: 14, width: 24 },
  track: { backgroundColor: theme.border, borderRadius: 2, flex: 1, height: 4, overflow: "hidden" },
  trackFill: { backgroundColor: theme.text, height: 4 },
  time: { color: theme.textMuted, fontSize: 12, fontVariant: ["tabular-nums"], width: 40 },
});
