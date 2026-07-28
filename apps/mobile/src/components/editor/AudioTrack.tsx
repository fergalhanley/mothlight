import { type Asset, formatDurationMs, type Segment } from "@mothlight/core";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

/**
 * Audio track: one voiceover per segment.
 *
 * The SFX row from the original spec is not rendered — §8 cuts it, and the schema keeps
 * the field so v0.1 can fill it in without a migration. Background music is
 * project-level and lives above the segment list, not here.
 */
export function AudioTrack({
  segment,
  assets,
  resolveUri,
  onRecorded,
  onImportFile,
  onRemove,
}: {
  segment: Segment;
  assets: Asset[];
  resolveUri: (uri: string) => string;
  /** Called with the temporary recording URI; the caller copies it into the project. */
  onRecorded: (uri: string, durationMs: number) => void;
  onImportFile: () => void;
  onRemove: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const vo = segment.audio.vo;
  const voAsset = vo ? assets.find((candidate) => candidate.id === vo.assetId) : undefined;

  const startRecording = useCallback(async () => {
    setError(null);

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError("Microphone access is needed to record a voiceover.");
      return;
    }

    try {
      // Recording and playback need different routing; set it before we start.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start recording.");
    }
  }, [recorder]);

  const stopRecording = useCallback(async () => {
    try {
      const elapsedMs = Math.round(recorderState.durationMillis ?? 0);
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      const uri = recorder.uri;
      if (uri) onRecorded(uri, elapsedMs);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save that recording.");
    }
  }, [recorder, recorderState.durationMillis, onRecorded]);

  return (
    <View style={styles.container}>
      <Text style={styles.trackLabel}>Audio</Text>

      {vo && voAsset ? (
        <VoiceoverRow
          uri={resolveUri(voAsset.uri)}
          durationMs={voAsset.durationMs}
          onReRecord={() => void startRecording()}
          onRemove={onRemove}
        />
      ) : recorderState.isRecording ? (
        <View style={styles.recordingRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingTime}>
            {formatDurationMs(recorderState.durationMillis ?? 0)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void stopRecording()}
            style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
          >
            <Text style={styles.stopLabel}>Stop</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void startRecording()}
            style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
          >
            <Text style={styles.recordLabel}>Record voiceover</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onImportFile}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryLabel}>Import</Text>
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function VoiceoverRow({
  uri,
  durationMs,
  onReRecord,
  onRemove,
}: {
  uri: string;
  durationMs: number | null;
  onReRecord: () => void;
  onRemove: () => void;
}) {
  const player = useAudioPlayer({ uri });

  return (
    <View style={styles.voRow}>
      <Pressable
        accessibilityLabel="Play voiceover"
        accessibilityRole="button"
        onPress={() => {
          player.seekTo(0);
          player.play();
        }}
        style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
      >
        <Text style={styles.playIcon}>▶</Text>
      </Pressable>

      <View style={styles.voDetails}>
        <Text style={styles.voTitle}>Voiceover</Text>
        <Text style={styles.voMeta}>{durationMs ? formatDurationMs(durationMs) : "Recorded"}</Text>
      </View>

      <Pressable accessibilityRole="button" hitSlop={8} onPress={onReRecord}>
        <Text style={styles.link}>Re-record</Text>
      </Pressable>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onRemove}>
        <Text style={[styles.link, styles.destructive]}>Remove</Text>
      </Pressable>
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
  actionRow: { flexDirection: "row", gap: 8 },
  recordButton: {
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recordLabel: { color: theme.text, fontSize: 14 },
  secondaryButton: {
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryLabel: { color: theme.textMuted, fontSize: 14 },
  recordingRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  recordingDot: { backgroundColor: theme.danger, borderRadius: 6, height: 12, width: 12 },
  recordingTime: { color: theme.text, flex: 1, fontSize: 16, fontVariant: ["tabular-nums"] },
  stopButton: {
    backgroundColor: theme.danger,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  stopLabel: { color: theme.background, fontSize: 14, fontWeight: "600" },
  voRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  playButton: {
    alignItems: "center",
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  playIcon: { color: theme.text, fontSize: 13 },
  voDetails: { flex: 1 },
  voTitle: { color: theme.text, fontSize: 14 },
  voMeta: { color: theme.textMuted, fontSize: 12 },
  link: { color: "#8ab4ff", fontSize: 13 },
  destructive: { color: theme.danger },
  pressed: { opacity: 0.7 },
  error: { color: theme.danger, fontSize: 13 },
});
