import { formatRelativeTime, formatSegmentCount } from "@mothlight/core";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { ProjectSummary } from "@/lib/storage/projects";
import { theme } from "@/lib/theme";

/** Past this fraction of the screen, letting go dismisses rather than springs back. */
const DISMISS_FRACTION = 0.35;

/**
 * One dashboard row, swipeable in either direction to delete.
 *
 * Deletion is optimistic and undoable, so the swipe commits nothing itself — it just
 * tells the caller the row is gone. See useProjectList.
 */
export function ProjectRow({
  summary,
  onOpen,
  onLongPress,
  onSwipeDismiss,
}: {
  summary: ProjectSummary;
  onOpen: () => void;
  onLongPress: () => void;
  onSwipeDismiss: () => void;
}) {
  const { width } = useWindowDimensions();
  const translateX = useSharedValue(0);

  const pan = Gesture.Pan()
    // Horizontal intent only — the vertical list must keep its scroll.
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      const threshold = width * DISMISS_FRACTION;
      const flung = Math.abs(event.velocityX) > 800;

      if (Math.abs(event.translationX) > threshold || flung) {
        const direction = event.translationX > 0 ? 1 : -1;
        translateX.value = withTiming(direction * width, { duration: 160 }, (finished) => {
          if (finished) runOnJS(onSwipeDismiss)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: 1 - Math.min(Math.abs(translateX.value) / width, 0.75),
  }));

  return (
    <View style={styles.container}>
      {/* Revealed behind the row as it slides away. */}
      <View style={styles.deleteLayer}>
        <Text style={styles.deleteLabel}>Delete</Text>
        <Text style={styles.deleteLabel}>Delete</Text>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={animatedStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${summary.name}, ${summary.durationLabel}, ${formatSegmentCount(summary.segmentCount)}`}
            onPress={onOpen}
            onLongPress={onLongPress}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            {summary.thumbnailUri ? (
              <Image
                source={{ uri: summary.thumbnailUri }}
                style={styles.thumbnail}
                contentFit="cover"
                transition={120}
              />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailEmpty]} />
            )}

            <View style={styles.details}>
              <Text style={styles.name} numberOfLines={1}>
                {summary.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {summary.durationLabel} · {formatSegmentCount(summary.segmentCount)}
              </Text>
              <Text style={styles.timestamp} numberOfLines={1}>
                {formatRelativeTime(summary.updatedAt)}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "center" },
  deleteLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#3a1d1d",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  deleteLabel: { color: theme.danger, fontSize: 14, fontWeight: "600" },
  row: {
    backgroundColor: theme.background,
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowPressed: { backgroundColor: theme.surface },
  // 9:16, matching the canvas.
  thumbnail: { width: 54, height: 96, borderRadius: 6, backgroundColor: theme.surface },
  thumbnailEmpty: { borderColor: theme.border, borderWidth: 1 },
  details: { flex: 1, gap: 4, justifyContent: "center" },
  name: { color: theme.text, fontSize: 16, fontWeight: "600" },
  meta: { color: theme.textMuted, fontSize: 13 },
  timestamp: { color: "#6b6b6b", fontSize: 12 },
});
