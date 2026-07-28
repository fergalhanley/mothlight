import type { Segment } from "@mothlight/core";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { theme } from "@/lib/theme";

/**
 * Script track: the words for one segment, plus its captions toggle.
 *
 * There is no in-app dictation button. The keyboard's own dictation key is free, needs
 * no permission plumbing, and is what people already know — §8 cuts custom speech
 * recognition to v0.1.
 */
export function ScriptTrack({
  segment,
  captionsResolved,
  onChangeScript,
  onSetCaptions,
}: {
  segment: Segment;
  /** What captions actually do for this segment once project inheritance is applied. */
  captionsResolved: boolean;
  onChangeScript: (script: string) => void;
  /** `null` clears the per-segment override and goes back to inheriting the project. */
  onSetCaptions: (enabled: boolean | null) => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.trackLabel}>Script</Text>

      <TextInput
        style={styles.input}
        value={segment.script}
        onChangeText={onChangeScript}
        placeholder="What is said in this segment?"
        placeholderTextColor={theme.textMuted}
        multiline
        textAlignVertical="top"
      />

      <View style={styles.captionRow}>
        <View style={styles.captionCopy}>
          <Text style={styles.captionLabel}>Captions</Text>
          <Text style={styles.captionHint}>
            {segment.captionsEnabled === null ? "Following the project setting" : "Set for this segment"}
          </Text>
        </View>

        <Switch
          value={captionsResolved}
          onValueChange={onSetCaptions}
          trackColor={{ false: theme.border, true: "#4a7dff" }}
          thumbColor={theme.text}
        />
      </View>

      {segment.captionsEnabled !== null ? (
        <Pressable accessibilityRole="button" onPress={() => onSetCaptions(null)}>
          <Text style={styles.inheritLink}>Reset to project default</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10, paddingVertical: 12 },
  trackLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 84,
    padding: 12,
  },
  captionRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  captionCopy: { gap: 2 },
  captionLabel: { color: theme.text, fontSize: 15 },
  captionHint: { color: theme.textMuted, fontSize: 12 },
  inheritLink: { color: "#8ab4ff", fontSize: 13 },
});
