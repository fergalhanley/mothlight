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
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PreviewPlayback } from "@/lib/editor/usePreviewPlayback";
import { theme } from "@/lib/theme";

/** The 9:16 preview used by the full-screen and floating players. */
export function PreviewCanvas({
  project,
  playback,
  resolveUri,
  size = "fullscreen",
}: {
  project: Project;
  playback: PreviewPlayback;
  resolveUri: (uri: string) => string;
  size?: "fullscreen" | "floating";
}) {
  const shot = playback.activeIndex >= 0 ? project.segments[playback.activeIndex] : undefined;
  const main = shot?.visual.main ?? null;
  const asset = main?.assetId
    ? project.assets.find((candidate) => candidate.id === main.assetId)
    : undefined;
  const [trackWidth, setTrackWidth] = useState(1);

  const shotDurationMs = useMemo(
    () => (shot ? resolveSegmentDurationMs(shot, project.assets) : 0),
    [shot, project.assets],
  );
  const caption = useMemo(() => {
    if (!shot || !resolveCaptionsEnabled(shot, project)) return null;
    return cueAt(
      buildCaptionCues(shot.script, shotDurationMs, project.captionStyle.wordsPerCue),
      playback.offsetMs,
    );
  }, [shot, project, shotDurationMs, playback.offsetMs]);
  const progress = playback.durationMs > 0 ? playback.positionMs / playback.durationMs : 0;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityLabel={playback.isPlaying ? "Pause preview" : "Play preview"}
        accessibilityRole="button"
        onPress={playback.toggle}
        style={[
          styles.canvas,
          size === "floating" ? styles.canvasFloating : styles.canvasFullscreen,
        ]}
      >
        {main?.type === "color" ? (
          <View style={[styles.fill, { backgroundColor: main.color ?? "#000000" }]} />
        ) : asset && main?.type === "video" ? (
          <VideoShot
            uri={resolveUri(asset.uri)}
            offsetMs={playback.offsetMs + main.trimStartMs}
            isPlaying={playback.isPlaying}
            fit={main.fit}
          />
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
              {project.segments.length === 0 ? "Add a shot" : "This shot needs a visual"}
            </Text>
          </View>
        )}

        {shot?.visual.overlays.map((overlay) => {
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
        <Pressable
          accessibilityLabel="Seek preview"
          accessibilityRole="adjustable"
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          onPress={(event) =>
            playback.seek((event.nativeEvent.locationX / trackWidth) * playback.durationMs)
          }
          style={styles.trackTouch}
        >
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${Math.min(progress, 1) * 100}%` }]} />
          </View>
        </Pressable>
        <Text style={styles.time}>{formatDurationMs(playback.positionMs)}</Text>
      </View>
    </View>
  );
}

function VideoShot({
  uri,
  offsetMs,
  isPlaying,
  fit,
}: {
  uri: string;
  offsetMs: number;
  isPlaying: boolean;
  fit: "cover" | "contain";
}) {
  const player = useVideoPlayer({ uri });

  useEffect(() => {
    const targetSeconds = offsetMs / 1000;
    if (Math.abs(player.currentTime - targetSeconds) > 0.2) player.currentTime = targetSeconds;
    if (isPlaying) player.play();
    else player.pause();
  }, [isPlaying, offsetMs, player]);

  return (
    <VideoView
      player={player}
      nativeControls={false}
      contentFit={fit}
      style={styles.fill}
      surfaceType="textureView"
    />
  );
}

const PREVIEW_SCALE = 280 / 1080;

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", width: "100%" },
  canvas: { aspectRatio: 9 / 16, backgroundColor: "#000", borderRadius: 12, overflow: "hidden" },
  canvasFullscreen: { flex: 1, maxHeight: "84%", maxWidth: "100%" },
  canvasFloating: { height: 260 },
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
    paddingHorizontal: 4,
    width: "100%",
  },
  transport: { color: theme.text, fontSize: 14, width: 24 },
  trackTouch: { flex: 1, justifyContent: "center", minHeight: 32 },
  track: { backgroundColor: theme.border, borderRadius: 2, height: 4, overflow: "hidden" },
  trackFill: { backgroundColor: theme.text, height: 4 },
  time: { color: theme.textMuted, fontSize: 12, fontVariant: ["tabular-nums"], width: 40 },
});
