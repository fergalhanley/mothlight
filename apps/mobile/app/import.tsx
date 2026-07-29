import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AGENT_NOTES, AGENT_PROMPT } from "@/lib/agentPrompt";
import { pickAndImportProject } from "@/lib/storage/importFile";
import { markProjectOpened } from "@/lib/storage/prefs";
import { theme } from "@/lib/theme";

/**
 * Import, and the agent workflow that makes importing worth doing.
 *
 * §2.3 calls this out as zero build cost and a big differentiator, which is about right:
 * the format is already the export format, so all this screen has to do is explain it and
 * hand over a prompt.
 */
export default function ImportScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const onImport = useCallback(async () => {
    setError(null);
    setIsWorking(true);
    try {
      const result = await pickAndImportProject();
      if (result.status === "failed") {
        setError(result.error);
        return;
      }
      if (result.status === "cancelled") return;

      await markProjectOpened(result.project.id);
      router.replace(`/project/${result.project.id}`);
    } finally {
      setIsWorking(false);
    }
  }, [router]);

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
        <Text style={styles.title}>Import a script</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          disabled={isWorking}
          onPress={() => void onImport()}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryLabel}>{isWorking ? "Opening…" : "Choose a .json file"}</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Write scripts with an AI agent</Text>
          <Text style={styles.body}>
            Mothlight projects are plain JSON. Hand the prompt below to any AI assistant, save what
            it gives you as a .json file, and open it here. The agent writes the structure and the
            words; you add the pictures.
          </Text>

          {AGENT_NOTES.map((note) => (
            <Text key={note} style={styles.note}>
              • {note}
            </Text>
          ))}
        </View>

        <View style={styles.promptBlock}>
          {/* Selectable so it can be long-pressed and copied without a clipboard module. */}
          <Text selectable style={styles.promptText}>
            {AGENT_PROMPT}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void Share.share({ message: AGENT_PROMPT })}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryLabel}>Share this prompt</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.background, flex: 1 },
  topBar: { alignItems: "center", flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8 },
  back: { color: theme.text, fontSize: 32, lineHeight: 34, width: 32 },
  title: { color: theme.text, flex: 1, fontSize: 16, fontWeight: "600", textAlign: "center" },
  spacer: { width: 32 },
  content: { gap: 20, padding: 16, paddingBottom: 48 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingVertical: 14,
  },
  primaryLabel: { color: theme.background, fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    alignItems: "center",
    borderColor: theme.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 13,
  },
  secondaryLabel: { color: theme.text, fontSize: 15 },
  section: { gap: 8 },
  sectionTitle: { color: theme.text, fontSize: 18, fontWeight: "600" },
  body: { color: theme.textMuted, fontSize: 14, lineHeight: 20 },
  note: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
  promptBlock: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
  },
  promptText: { color: theme.text, fontFamily: "monospace", fontSize: 12, lineHeight: 18 },
  error: { color: theme.danger, fontSize: 14 },
  pressed: { opacity: 0.7 },
});
