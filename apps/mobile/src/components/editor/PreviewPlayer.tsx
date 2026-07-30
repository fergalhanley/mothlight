import type { Project } from "@mothlight/core";
import { useAudioPlayer } from "expo-audio";
import { useEffect, useMemo, useRef } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PreviewPlayback } from "@/lib/editor/usePreviewPlayback";
import { theme } from "@/lib/theme";
import { PreviewCanvas } from "./PreviewCanvas";

export function PreviewPlayer({
  project,
  playback,
  resolveUri,
  mode,
  onSetMode,
  onClose,
}: {
  project: Project;
  playback: PreviewPlayback;
  resolveUri: (uri: string) => string;
  mode: "closed" | "fullscreen" | "floating";
  onSetMode: (mode: "fullscreen" | "floating") => void;
  onClose: () => void;
}) {
  const position = useRef({ x: 16, y: 110 });
  const origin = useRef({ x: 0, y: 0 });
  const floatingRef = useRef<View>(null);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          origin.current = { ...position.current };
        },
        onPanResponderMove: (_event, gesture) => {
          position.current = {
            x: Math.max(8, origin.current.x + gesture.dx),
            y: Math.max(56, origin.current.y + gesture.dy),
          };
          floatingRef.current?.setNativeProps({
            style: { left: position.current.x, top: position.current.y },
          });
        },
      }),
    [],
  );

  if (mode === "closed") return null;
  const soundtrackAsset = project.soundtrack.assetId
    ? project.assets.find((asset) => asset.id === project.soundtrack.assetId)
    : undefined;
  const activeShot = playback.activeIndex >= 0 ? project.segments[playback.activeIndex] : undefined;
  const voiceoverAsset = activeShot?.audio.vo
    ? project.assets.find((asset) => asset.id === activeShot.audio.vo?.assetId)
    : undefined;

  const audio = (
    <>
      {soundtrackAsset ? (
        <SyncedAudio
          uri={resolveUri(soundtrackAsset.uri)}
          positionMs={playback.positionMs}
          isPlaying={playback.isPlaying}
          gainDb={project.soundtrack.gainDb}
        />
      ) : null}
      {voiceoverAsset && activeShot?.audio.vo ? (
        <SyncedAudio
          key={voiceoverAsset.id}
          uri={resolveUri(voiceoverAsset.uri)}
          positionMs={playback.offsetMs + activeShot.audio.vo.trimStartMs}
          isPlaying={playback.isPlaying}
          gainDb={activeShot.audio.vo.gainDb}
        />
      ) : null}
    </>
  );

  if (mode === "floating") {
    return (
      <View
        ref={floatingRef}
        style={[styles.floating, { left: position.current.x, top: position.current.y }]}
      >
        <View style={styles.handle} {...panResponder.panHandlers}>
          <Text style={styles.handleLabel}>Preview · drag</Text>
          <Pressable
            accessibilityLabel="Open full-screen preview"
            onPress={() => onSetMode("fullscreen")}
          >
            <Text style={styles.control}>⛶</Text>
          </Pressable>
          <Pressable accessibilityLabel="Close preview" onPress={onClose}>
            <Text style={styles.control}>×</Text>
          </Pressable>
        </View>
        <PreviewCanvas
          project={project}
          playback={playback}
          resolveUri={resolveUri}
          size="floating"
        />
        {audio}
      </View>
    );
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.fullscreen}>
        <View style={styles.fullscreenBar}>
          <Text style={styles.title}>Preview</Text>
          <Pressable accessibilityRole="button" onPress={() => onSetMode("floating")}>
            <Text style={styles.action}>Float</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Close preview"
            accessibilityRole="button"
            onPress={onClose}
          >
            <Text style={styles.close}>×</Text>
          </Pressable>
        </View>
        <PreviewCanvas project={project} playback={playback} resolveUri={resolveUri} />
        {audio}
      </SafeAreaView>
    </Modal>
  );
}

function SyncedAudio({
  uri,
  positionMs,
  isPlaying,
  gainDb,
}: {
  uri: string;
  positionMs: number;
  isPlaying: boolean;
  gainDb: number;
}) {
  const player = useAudioPlayer({ uri });

  useEffect(() => {
    player.volume = Math.min(1, 10 ** (gainDb / 20));
    const targetSeconds = positionMs / 1000;
    if (Math.abs(player.currentTime - targetSeconds) > 0.25) void player.seekTo(targetSeconds);
    if (isPlaying) player.play();
    else player.pause();
  }, [gainDb, isPlaying, player, positionMs]);

  return null;
}

const styles = StyleSheet.create({
  fullscreen: { backgroundColor: theme.background, flex: 1, padding: 12 },
  fullscreenBar: { alignItems: "center", flexDirection: "row", gap: 18, paddingBottom: 10 },
  title: { color: theme.text, flex: 1, fontSize: 18, fontWeight: "600" },
  action: { color: "#8ab4ff", fontSize: 15 },
  close: { color: theme.text, fontSize: 28, lineHeight: 30 },
  floating: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 12,
    padding: 8,
    position: "absolute",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    width: 180,
    zIndex: 20,
  },
  handle: { alignItems: "center", flexDirection: "row", gap: 8, paddingBottom: 4 },
  handleLabel: { color: theme.textMuted, flex: 1, fontSize: 10 },
  control: { color: theme.text, fontSize: 18 },
});
