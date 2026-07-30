import type { Asset, Overlay, Segment, VisualMain } from "@mothlight/core";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { theme } from "@/lib/theme";

/**
 * Visual track: one main visual per segment, plus text overlays.
 *
 * The Effects row from the original spec is not rendered at all. §8 cuts it, and a
 * disabled "coming soon" row reads as an unfinished app to a reviewer.
 */

/** Solid-colour cards, for a title beat or a segment whose picture has not arrived yet. */
export const COLOR_SWATCHES = ["#1B1F3B", "#2B1B3B", "#3B1B2B", "#3B2B1B", "#1B3B2B", "#0A0A0A"];

export function VisualTrack({
  segment,
  assets,
  resolveUri,
  onPickFromLibrary,
  onPickFromFiles,
  onChooseColor,
  onUpdateMain,
  onRemoveMain,
  onAddTextOverlay,
  onEditOverlay,
  onRemoveOverlay,
}: {
  segment: Segment;
  assets: Asset[];
  resolveUri: (uri: string) => string;
  onPickFromLibrary: () => void;
  onPickFromFiles: () => void;
  onChooseColor: (color: string) => void;
  onUpdateMain: (mutate: (main: VisualMain) => VisualMain) => void;
  onRemoveMain: () => void;
  onAddTextOverlay: () => void;
  onEditOverlay: (overlay: Overlay) => void;
  onRemoveOverlay: (overlayId: string) => void;
}) {
  const main = segment.visual.main;
  const asset = main?.assetId ? assets.find((candidate) => candidate.id === main.assetId) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.trackLabel}>Visual</Text>

      {main === null ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyHint}>This shot needs a visual.</Text>
          <View style={styles.chooserRow}>
            <ChooserButton label="Photo library" onPress={onPickFromLibrary} />
            <ChooserButton label="Files" onPress={onPickFromFiles} />
          </View>
          <ColorRow onChoose={onChooseColor} />
        </View>
      ) : (
        <View style={styles.mainRow}>
          <MainPreview main={main} uri={asset ? resolveUri(asset.uri) : null} />

          <View style={styles.mainActions}>
            <Text style={styles.mainType}>
              {main.type === "color" ? "Solid colour" : main.type === "video" ? "Video" : "Image"}
            </Text>

            <View style={styles.actionRow}>
              <SmallButton label="Replace" onPress={onPickFromLibrary} />
              <SmallButton label="Remove" onPress={onRemoveMain} destructive />
            </View>

            {main.type === "image" ? (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Ken Burns</Text>
                <Switch
                  value={main.kenBurns.enabled}
                  onValueChange={(enabled) =>
                    onUpdateMain((current) => ({
                      ...current,
                      kenBurns: { ...current.kenBurns, enabled },
                    }))
                  }
                  trackColor={{ false: theme.border, true: "#4a7dff" }}
                  thumbColor={theme.text}
                />
              </View>
            ) : null}

            {main.type === "video" ? (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Mute source audio</Text>
                <Switch
                  value={main.muteSourceAudio}
                  onValueChange={(muteSourceAudio) =>
                    onUpdateMain((current) => ({ ...current, muteSourceAudio }))
                  }
                  trackColor={{ false: theme.border, true: "#4a7dff" }}
                  thumbColor={theme.text}
                />
              </View>
            ) : null}
          </View>
        </View>
      )}

      <View style={styles.overlayHeader}>
        <Text style={styles.subLabel}>Overlays</Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onAddTextOverlay}>
          <Text style={styles.addLink}>+ Text</Text>
        </Pressable>
      </View>

      {segment.visual.overlays.length === 0 ? (
        <Text style={styles.overlayHint}>Drag text on the preview above to position it.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {segment.visual.overlays.map((overlay) => (
            <View key={overlay.id} style={styles.chip}>
              <Pressable accessibilityRole="button" onPress={() => onEditOverlay(overlay)}>
                <Text style={styles.chipLabel} numberOfLines={1}>
                  {overlay.text ?? overlay.type}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Remove overlay"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => onRemoveOverlay(overlay.id)}
              >
                <Text style={styles.chipRemove}>×</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function MainPreview({ main, uri }: { main: VisualMain; uri: string | null }) {
  if (main.type === "color") {
    return <View style={[styles.preview, { backgroundColor: main.color ?? "#000000" }]} />;
  }
  if (!uri) {
    return <View style={[styles.preview, styles.previewMissing]} />;
  }
  return <Image source={{ uri }} style={styles.preview} contentFit="cover" transition={120} />;
}

function ColorRow({ onChoose }: { onChoose: (color: string) => void }) {
  return (
    <View style={styles.colorRow}>
      {COLOR_SWATCHES.map((color) => (
        <Pressable
          accessibilityLabel={`Use solid colour ${color}`}
          accessibilityRole="button"
          key={color}
          onPress={() => onChoose(color)}
          style={[styles.swatch, { backgroundColor: color }]}
        />
      ))}
    </View>
  );
}

function ChooserButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.chooser, pressed && styles.pressed]}
    >
      <Text style={styles.chooserLabel}>{label}</Text>
    </Pressable>
  );
}

function SmallButton({
  label,
  onPress,
  destructive,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
    >
      <Text style={[styles.smallButtonLabel, destructive && styles.destructive]}>{label}</Text>
    </Pressable>
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
  subLabel: { color: theme.textMuted, fontSize: 13 },
  emptyState: { gap: 10 },
  emptyHint: { color: theme.textMuted, fontSize: 14 },
  chooserRow: { flexDirection: "row", gap: 8 },
  chooser: {
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chooserLabel: { color: theme.text, fontSize: 14 },
  colorRow: { flexDirection: "row", gap: 8 },
  swatch: { borderColor: theme.border, borderRadius: 6, borderWidth: 1, height: 32, width: 32 },
  mainRow: { flexDirection: "row", gap: 12 },
  preview: { backgroundColor: theme.background, borderRadius: 8, height: 96, width: 54 },
  previewMissing: { borderColor: theme.danger, borderWidth: 1 },
  mainActions: { flex: 1, gap: 10, justifyContent: "center" },
  mainType: { color: theme.text, fontSize: 14, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 8 },
  smallButton: {
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallButtonLabel: { color: theme.text, fontSize: 13 },
  destructive: { color: theme.danger },
  pressed: { opacity: 0.7 },
  toggleRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  toggleLabel: { color: theme.text, fontSize: 14 },
  overlayHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  addLink: { color: "#8ab4ff", fontSize: 14, fontWeight: "600" },
  overlayHint: { color: theme.textMuted, fontSize: 12 },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    alignItems: "center",
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipLabel: { color: theme.text, fontSize: 13 },
  chipRemove: { color: theme.textMuted, fontSize: 16, lineHeight: 18 },
});
