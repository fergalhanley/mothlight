import {
  describeRenderJob,
  formatDurationMs,
  type Project,
  preflightRender,
  type RenderPreflight,
} from "@mothlight/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { saveVideoToPhotos, shareVideo } from "@/lib/render/saveToPhotos";
import { serverRenderEngine } from "@/lib/render/serverEngine";
import { useRenderJob } from "@/lib/render/useRenderJob";
import { assetSizesFor, resolvedAssetUris } from "@/lib/storage/assetSizes";
import { loadProject } from "@/lib/storage/projects";
import { theme } from "@/lib/theme";

/**
 * Render progress. See §7.
 *
 * Preflight runs before anything is uploaded — telling someone their segment 3 has no
 * picture is free now and expensive after a 100MB upload over cellular.
 */
export default function RenderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [preflight, setPreflight] = useState<RenderPreflight | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const render = useRenderJob(serverRenderEngine, {
    onDownloaded: useCallback(async (uri: string) => {
      const result = await saveVideoToPhotos(uri);
      if (result.status === "denied") {
        setSaveNotice("Saved to Mothlight, but not to Photos — permission was declined.");
      } else if (result.status === "failed") {
        setSaveNotice(result.error);
      } else {
        setSaveNotice("Saved to your photo library.");
      }
    }, []),
  });

  useEffect(() => {
    let cancelled = false;

    loadProject(id)
      .then(async (loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setLoadError("That project no longer exists.");
          return;
        }
        setProject(loaded);
        setPreflight(preflightRender(loaded, await assetSizesFor(loaded)));
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : "Could not open that project.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const onRender = useCallback(() => {
    if (!project) return;
    void render.start({ project, assetUris: resolvedAssetUris(project) });
  }, [project, render]);

  const busy =
    render.phase === "uploading" ||
    render.phase === "waiting" ||
    render.phase === "downloading" ||
    render.phase === "saving";

  const statusLine = useMemo(() => {
    switch (render.phase) {
      case "uploading":
        return render.uploadProgress > 0
          ? `Uploading — ${Math.round(render.uploadProgress * 100)}%`
          : "Uploading your media…";
      case "waiting":
        return render.job ? describeRenderJob(render.job) : "Waiting for a render slot…";
      case "downloading":
        return "Downloading your video…";
      case "saving":
        return "Saving to your photos…";
      case "done":
        return "Your video is ready.";
      case "failed":
        return render.error ?? "The render failed.";
      default:
        return null;
    }
  }, [render.phase, render.uploadProgress, render.job, render.error]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => router.back()}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Render</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

        {project && preflight ? (
          <>
            <View style={styles.summary}>
              <Text style={styles.projectName} numberOfLines={2}>
                {project.name}
              </Text>
              <Text style={styles.meta}>
                {formatDurationMs(preflight.durationMs)} · 1080×1920 · 30fps
              </Text>
              {preflight.uploadBytes > 0 ? (
                <Text style={styles.meta}>
                  {(preflight.uploadBytes / 1024 / 1024).toFixed(1)}MB to upload
                </Text>
              ) : null}
            </View>

            {preflight.blockers.length > 0 ? (
              <View style={styles.blockers}>
                <Text style={styles.blockerTitle}>Not ready to render</Text>
                {preflight.blockers.map((blocker) => (
                  <Text key={blocker.message} style={styles.blockerText}>
                    • {blocker.message}
                  </Text>
                ))}
              </View>
            ) : null}

            {preflight.warnings.map((warning) => (
              <Text key={warning} style={styles.warning}>
                {warning}
              </Text>
            ))}

            {statusLine ? (
              <View style={styles.statusBlock}>
                {busy ? <ActivityIndicator color={theme.textMuted} /> : null}
                <Text style={render.phase === "failed" ? styles.error : styles.status}>
                  {statusLine}
                </Text>
              </View>
            ) : null}

            {saveNotice ? <Text style={styles.notice}>{saveNotice}</Text> : null}

            {render.phase === "done" && render.outputUri ? (
              <>
                <RenderedVideo uri={render.outputUri} />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void shareVideo(render.outputUri as string)}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryLabel}>Share your video</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={busy || preflight.blockers.length > 0}
                onPress={render.phase === "failed" ? () => render.reset() : onRender}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (busy || preflight.blockers.length > 0) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryLabel}>
                  {render.phase === "failed" ? "Try again" : "Render video"}
                </Text>
              </Pressable>
            )}
          </>
        ) : loadError ? null : (
          <ActivityIndicator color={theme.textMuted} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RenderedVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (instance) => instance.play());
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={styles.renderedVideo}
      surfaceType="textureView"
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.background, flex: 1 },
  topBar: { alignItems: "center", flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8 },
  back: { color: theme.text, fontSize: 32, lineHeight: 34, width: 32 },
  title: { color: theme.text, flex: 1, fontSize: 16, fontWeight: "600", textAlign: "center" },
  spacer: { width: 32 },
  content: { gap: 20, padding: 16 },
  summary: { gap: 4 },
  projectName: { color: theme.text, fontSize: 20, fontWeight: "600" },
  meta: { color: theme.textMuted, fontSize: 13 },
  blockers: {
    backgroundColor: "#3a2f1d",
    borderRadius: 10,
    gap: 6,
    padding: 14,
  },
  blockerTitle: { color: "#e0b341", fontSize: 15, fontWeight: "600" },
  blockerText: { color: "#e0b341", fontSize: 13, lineHeight: 19 },
  warning: { color: "#e0b341", fontSize: 13 },
  statusBlock: { alignItems: "center", flexDirection: "row", gap: 12 },
  status: { color: theme.text, flex: 1, fontSize: 15 },
  notice: { color: theme.textMuted, fontSize: 13 },
  renderedVideo: {
    alignSelf: "center",
    aspectRatio: 9 / 16,
    backgroundColor: "#000",
    borderRadius: 12,
    height: 420,
    overflow: "hidden",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingVertical: 14,
  },
  primaryLabel: { color: theme.background, fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  error: { color: theme.danger, flex: 1, fontSize: 14 },
});
