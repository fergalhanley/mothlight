import { formatDurationMs, formatSegmentCount, type Project } from "@mothlight/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadProject } from "@/lib/storage/projects";
import { theme } from "@/lib/theme";

/**
 * Editor.
 *
 * Shell only — the preview canvas, soundtrack row, and segment accordion land next.
 * See §2.4 of agent/v0-requirements.md.
 */
export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    loadProject(id)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) setError("That project no longer exists.");
        setProject(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open that.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {project?.name ?? "…"}
          </Text>
          {project ? (
            <Text style={styles.subtitle}>
              {formatDurationMs(
                project.segments.reduce((total, segment) => total + segment.durationMs, 0),
              )}{" "}
              · {formatSegmentCount(project.segments.length)}
            </Text>
          ) : null}
        </View>

        <View style={styles.topBarSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.textMuted} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.placeholder}>Editor coming next</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.background, flex: 1 },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: { color: theme.text, fontSize: 32, lineHeight: 34, width: 32 },
  titleBlock: { alignItems: "center", flex: 1 },
  title: { color: theme.text, fontSize: 16, fontWeight: "600" },
  subtitle: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  topBarSpacer: { width: 32 },
  centered: { alignItems: "center", flex: 1, justifyContent: "center" },
  error: { color: theme.danger, fontSize: 14, paddingHorizontal: 32, textAlign: "center" },
  placeholder: { color: theme.textMuted, fontSize: 14 },
});
