import { type Asset, formatDurationMs, type Segment } from "@mothlight/core";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

/**
 * One segment, collapsed to a summary row or expanded into its three tracks.
 *
 * Expansion is an inline accordion rather than a pushed screen (decision 3): overlay
 * positioning happens by dragging on the preview canvas above, so the canvas has to stay
 * on screen while you edit.
 */
export function SegmentCard({
  segment,
  index,
  assets,
  resolveUri,
  durationMs,
  captionsResolved,
  isExpanded,
  onToggle,
  onShowActions,
  children,
}: {
  segment: Segment;
  index: number;
  assets: Asset[];
  resolveUri: (uri: string) => string;
  durationMs: number;
  captionsResolved: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onShowActions: () => void;
  /** The three tracks, rendered by the editor screen only while expanded. */
  children?: ReactNode;
}) {
  const main = segment.visual.main;
  const asset = main?.assetId ? assets.find((candidate) => candidate.id === main.assetId) : null;
  const hasVoiceover = segment.audio.vo !== null;

  return (
    <View style={[styles.card, isExpanded && styles.cardExpanded]}>
      <Pressable
        accessibilityLabel={`Segment ${index + 1}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={onToggle}
        onLongPress={onShowActions}
        style={styles.header}
      >
        <Thumbnail main={main} uri={asset ? resolveUri(asset.uri) : null} />

        <View style={styles.summary}>
          <View style={styles.summaryTop}>
            <Text style={styles.index}>SEGMENT {index + 1}</Text>
            <Text style={styles.duration}>{formatDurationMs(durationMs)}</Text>
          </View>

          <Text style={styles.script} numberOfLines={isExpanded ? 1 : 2}>
            {segment.script.trim() || "No script yet"}
          </Text>

          <View style={styles.badges}>
            <Badge label="Voiceover" active={hasVoiceover} />
            <Badge label="Captions" active={captionsResolved} />
            {main === null ? <Badge label="Needs a visual" warning /> : null}
          </View>
        </View>

        <Pressable
          accessibilityLabel={`Segment ${index + 1} actions`}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onShowActions}
        >
          <Text style={styles.overflow}>⋯</Text>
        </Pressable>
      </Pressable>

      {isExpanded ? <View style={styles.tracks}>{children}</View> : null}
    </View>
  );
}

function Thumbnail({ main, uri }: { main: Segment["visual"]["main"]; uri: string | null }) {
  if (main?.type === "color") {
    return <View style={[styles.thumbnail, { backgroundColor: main.color ?? "#000" }]} />;
  }
  if (uri) {
    return <Image source={{ uri }} style={styles.thumbnail} contentFit="cover" transition={120} />;
  }
  return <View style={[styles.thumbnail, styles.thumbnailEmpty]} />;
}

function Badge({ label, active, warning }: { label: string; active?: boolean; warning?: boolean }) {
  return (
    <View style={[styles.badge, warning && styles.badgeWarning]}>
      <Text
        style={[
          styles.badgeLabel,
          active && styles.badgeLabelActive,
          warning && styles.badgeLabelWarning,
        ]}
      >
        {active ? `${label} ✓` : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardExpanded: { borderColor: "#4a7dff" },
  header: { alignItems: "center", flexDirection: "row", gap: 12, padding: 12 },
  thumbnail: { backgroundColor: theme.background, borderRadius: 6, height: 72, width: 40 },
  thumbnailEmpty: { borderColor: theme.border, borderStyle: "dashed", borderWidth: 1 },
  summary: { flex: 1, gap: 6 },
  summaryTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  index: { color: theme.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  duration: { color: theme.textMuted, fontSize: 12, fontVariant: ["tabular-nums"] },
  script: { color: theme.text, fontSize: 14, lineHeight: 19 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: {
    backgroundColor: theme.background,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeWarning: { backgroundColor: "#3a2f1d" },
  badgeLabel: { color: theme.textMuted, fontSize: 11 },
  badgeLabelActive: { color: theme.text },
  badgeLabelWarning: { color: "#e0b341" },
  overflow: { color: theme.textMuted, fontSize: 22, paddingHorizontal: 4 },
  tracks: {
    borderTopColor: theme.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
});
