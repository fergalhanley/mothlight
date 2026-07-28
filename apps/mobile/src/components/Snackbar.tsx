import { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/lib/theme";

/**
 * Material-style snackbar, used on both platforms.
 *
 * The action is the only way back from a destructive change — deletes have no
 * confirmation dialog — so the bar is deliberately reachable and the label is a verb.
 */
export function Snackbar({
  message,
  actionLabel,
  onAction,
  onTimeout,
  durationMs,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Fires when the bar times out. The caller owns the countdown's real consequences. */
  onTimeout?: () => void;
  durationMs?: number;
}) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!durationMs || !onTimeout) return;
    const timer = setTimeout(onTimeout, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onTimeout]);

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      style={[styles.container, { bottom: insets.bottom + 16 }]}
    >
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      {actionLabel ? (
        <Pressable accessibilityRole="button" hitSlop={12} onPress={onAction}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    // Sits above the list and the FAB.
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  message: { color: theme.text, flexShrink: 1, fontSize: 14 },
  action: {
    color: "#8ab4ff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
