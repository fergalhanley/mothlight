import {
  assetsById,
  createId,
  formatDurationMs,
  formatSegmentCount,
  resolveCaptionsEnabled,
  resolveSegmentDurationMs,
  type Segment,
} from "@mothlight/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { AudioTrack } from "@/components/editor/AudioTrack";
import { PreviewCanvas } from "@/components/editor/PreviewCanvas";
import { ScriptTrack } from "@/components/editor/ScriptTrack";
import { SegmentCard } from "@/components/editor/SegmentCard";
import { VisualTrack } from "@/components/editor/VisualTrack";
import {
  type ExportResult,
  shareProjectJson,
  shareScript,
  shareTimelineXml,
} from "@/lib/editor/exports";
import {
  type PickResult,
  pickAudioFromFiles,
  pickVisualFromFiles,
  pickVisualFromLibrary,
} from "@/lib/editor/pickMedia";
import { useEditor } from "@/lib/editor/useEditor";
import { usePreviewPlayback } from "@/lib/editor/usePreviewPlayback";
import { importAudioAsset } from "@/lib/storage/assets";
import { resolveAssetUri } from "@/lib/storage/paths";
import { theme } from "@/lib/theme";

/** Editor. See §2.4 of agent/v0-requirements.md. */
export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const editor = useEditor(id);
  const {
    project,
    isLoading,
    error,
    durationMs,
    expandedSegmentId,
    setExpandedSegmentId,
    update,
    updateSegment,
    addSegment,
    duplicateSegment,
    deleteSegment,
    moveSegment,
    addAsset,
    removeAsset,
    flush,
  } = editor;

  const playback = usePreviewPlayback(project);

  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [actionsFor, setActionsFor] = useState<Segment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);

  const byId = useMemo(() => assetsById(project?.assets ?? []), [project]);
  const resolveUri = useCallback((uri: string) => resolveAssetUri(id, uri), [id]);

  const goBack = useCallback(async () => {
    // Autosave is debounced; leaving without flushing would drop the last keystroke.
    await flush();
    router.back();
  }, [flush, router]);

  /** Shared handling for every picker: copy in, register, then point the segment at it. */
  const applyPick = useCallback(
    async (result: PickResult, onAsset: (assetId: string, kind: string) => void) => {
      if (result.status === "cancelled") return;
      if (result.status === "denied") {
        setNotice("Mothlight needs access to your photos to add a visual.");
        return;
      }
      if (result.status === "failed") {
        setNotice(result.error);
        return;
      }

      addAsset(result.asset);
      onAsset(result.asset.id, result.asset.kind);
    },
    [addAsset],
  );

  /** Reports anything an export could not do, rather than failing silently. */
  const runExport = useCallback(async (task: Promise<ExportResult>, label: string) => {
    const result = await task;
    if (result.status === "unavailable") {
      setNotice("Sharing isn't available on this device.");
    } else if (result.status === "failed") {
      setNotice(`${label} failed: ${result.error}`);
    }
  }, []);

  const projectMenuItems = useMemo((): ActionMenuItem[] => {
    if (!project) return [];

    return [
      { label: "Rename project", onPress: () => setIsRenamingTitle(true) },
      {
        label: "Export script (.md)",
        onPress: () => void runExport(shareScript(project), "Script export"),
      },
      {
        label: "Export timeline (FCP7 XML)",
        onPress: () => {
          // The XML points at media by absolute path on this device. Saying so up front
          // beats handing someone a timeline full of offline media.
          setNotice("The timeline references your media by path — copy the files too.");
          void runExport(shareTimelineXml(project), "Timeline export");
        },
      },
      {
        label: "Export project (.json)",
        onPress: () => void runExport(shareProjectJson(project), "Project export"),
      },
      {
        label: "Render video",
        onPress: () => setNotice("Rendering isn't wired up yet."),
      },
    ];
  }, [project, runExport]);

  const segmentActions = useMemo((): ActionMenuItem[] => {
    if (!actionsFor || !project) return [];
    const target = actionsFor;
    const index = project.segments.findIndex((segment) => segment.id === target.id);

    const items: ActionMenuItem[] = [];
    if (index > 0) items.push({ label: "Move up", onPress: () => moveSegment(target.id, -1) });
    if (index < project.segments.length - 1) {
      items.push({ label: "Move down", onPress: () => moveSegment(target.id, 1) });
    }
    items.push({ label: "Duplicate", onPress: () => duplicateSegment(target.id) });
    items.push({
      label: "Delete segment",
      destructive: true,
      onPress: () => deleteSegment(target.id),
    });
    return items;
  }, [actionsFor, project, moveSegment, duplicateSegment, deleteSegment]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.textMuted} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !project) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.error}>{error ?? "That project could not be opened."}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={styles.link}>Back to projects</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => void goBack()}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>

        <View style={styles.titleBlock}>
          {isRenamingTitle ? (
            <TextInput
              style={styles.titleInput}
              value={project.name}
              onChangeText={(name) => update((current) => ({ ...current, name }))}
              onBlur={() => setIsRenamingTitle(false)}
              onSubmitEditing={() => setIsRenamingTitle(false)}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
            />
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setIsRenamingTitle(true)}>
              <Text style={styles.title} numberOfLines={1}>
                {project.name}
              </Text>
            </Pressable>
          )}
          <Text style={styles.subtitle}>
            {formatDurationMs(durationMs)} · {formatSegmentCount(project.segments.length)}
          </Text>
        </View>

        <Pressable
          accessibilityLabel="Project menu"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => setShowProjectMenu(true)}
        >
          <Text style={styles.overflow}>⋯</Text>
        </Pressable>
      </View>

      <PreviewCanvas project={project} playback={playback} resolveUri={resolveUri} />

      <Pressable style={styles.soundtrackRow}>
        <Text style={styles.soundtrackLabel}>
          ♪ Soundtrack: {project.soundtrack.assetId ? "Selected" : "None"}
        </Text>
        <Text style={styles.soundtrackChevron}>⌄</Text>
      </Pressable>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {project.segments.map((segment, index) => {
            const isExpanded = segment.id === expandedSegmentId;
            const captionsResolved = resolveCaptionsEnabled(segment, project);

            return (
              <SegmentCard
                key={segment.id}
                segment={segment}
                index={index}
                assets={project.assets}
                resolveUri={resolveUri}
                durationMs={resolveSegmentDurationMs(segment, project.assets, byId)}
                captionsResolved={captionsResolved}
                isExpanded={isExpanded}
                onToggle={() => {
                  setExpandedSegmentId(isExpanded ? null : segment.id);
                  // Expanding seeks the canvas to that segment, so you always see
                  // what you are editing (§2.4).
                  if (!isExpanded) playback.seekToSegment(segment.id);
                }}
                onShowActions={() => setActionsFor(segment)}
              >
                <ScriptTrack
                  segment={segment}
                  captionsResolved={captionsResolved}
                  onChangeScript={(script) =>
                    updateSegment(segment.id, (current) => ({ ...current, script }))
                  }
                  onSetCaptions={(captionsEnabled) =>
                    updateSegment(segment.id, (current) => ({ ...current, captionsEnabled }))
                  }
                />

                <VisualTrack
                  segment={segment}
                  assets={project.assets}
                  resolveUri={resolveUri}
                  onPickFromLibrary={() =>
                    void pickVisualFromLibrary(id).then((result) =>
                      applyPick(result, (assetId, kind) =>
                        updateSegment(segment.id, (current) => ({
                          ...current,
                          visual: {
                            ...current.visual,
                            main: {
                              type: kind === "video" ? "video" : "image",
                              assetId,
                              fit: "cover",
                              color: null,
                              trimStartMs: 0,
                              trimEndMs: null,
                              muteSourceAudio: true,
                              kenBurns: {
                                enabled: kind !== "video",
                                from: "center",
                                to: "zoom-in",
                              },
                            },
                          },
                        })),
                      ),
                    )
                  }
                  onPickFromFiles={() =>
                    void pickVisualFromFiles(id).then((result) =>
                      applyPick(result, (assetId, kind) =>
                        updateSegment(segment.id, (current) => ({
                          ...current,
                          visual: {
                            ...current.visual,
                            main: {
                              type: kind === "video" ? "video" : "image",
                              assetId,
                              fit: "cover",
                              color: null,
                              trimStartMs: 0,
                              trimEndMs: null,
                              muteSourceAudio: true,
                              kenBurns: {
                                enabled: kind !== "video",
                                from: "center",
                                to: "zoom-in",
                              },
                            },
                          },
                        })),
                      ),
                    )
                  }
                  onChooseColor={(color) =>
                    updateSegment(segment.id, (current) => ({
                      ...current,
                      visual: {
                        ...current.visual,
                        main: {
                          type: "color",
                          assetId: null,
                          fit: "cover",
                          color,
                          trimStartMs: 0,
                          trimEndMs: null,
                          muteSourceAudio: true,
                          kenBurns: { enabled: false, from: "center", to: "zoom-in" },
                        },
                      },
                    }))
                  }
                  onUpdateMain={(mutate) =>
                    updateSegment(segment.id, (current) => ({
                      ...current,
                      visual: {
                        ...current.visual,
                        main: current.visual.main ? mutate(current.visual.main) : null,
                      },
                    }))
                  }
                  onRemoveMain={() => {
                    const assetId = segment.visual.main?.assetId;
                    if (assetId) {
                      removeAsset(assetId);
                    } else {
                      updateSegment(segment.id, (current) => ({
                        ...current,
                        visual: { ...current.visual, main: null },
                      }));
                    }
                  }}
                  onAddTextOverlay={() =>
                    updateSegment(segment.id, (current) => ({
                      ...current,
                      visual: {
                        ...current.visual,
                        overlays: [
                          ...current.visual.overlays,
                          {
                            id: createId("ov"),
                            type: "text",
                            text: "Text",
                            assetId: null,
                            x: 0.5,
                            y: 0.2,
                            scale: 1,
                            rotation: 0,
                            style: { font: "Inter-Bold", sizePt: 64, color: "#FFFFFF" },
                            startMs: 0,
                            endMs: null,
                          },
                        ],
                      },
                    }))
                  }
                  onEditOverlay={() => setNotice("Tap and drag on the preview to move text.")}
                  onRemoveOverlay={(overlayId) =>
                    updateSegment(segment.id, (current) => ({
                      ...current,
                      visual: {
                        ...current.visual,
                        overlays: current.visual.overlays.filter(
                          (overlay) => overlay.id !== overlayId,
                        ),
                      },
                    }))
                  }
                />

                <AudioTrack
                  segment={segment}
                  assets={project.assets}
                  resolveUri={resolveUri}
                  onRecorded={(uri, recordedMs) => {
                    void importAudioAsset(id, uri, {
                      source: "recording",
                      durationMs: recordedMs,
                    }).then((asset) => {
                      addAsset(asset);
                      updateSegment(segment.id, (current) => ({
                        ...current,
                        audio: {
                          ...current.audio,
                          vo: { assetId: asset.id, gainDb: 0, trimStartMs: 0 },
                        },
                      }));
                    });
                  }}
                  onImportFile={() =>
                    void pickAudioFromFiles(id).then((result) =>
                      applyPick(result, (assetId) =>
                        updateSegment(segment.id, (current) => ({
                          ...current,
                          audio: {
                            ...current.audio,
                            vo: { assetId, gainDb: 0, trimStartMs: 0 },
                          },
                        })),
                      ),
                    )
                  }
                  onRemove={() => {
                    const assetId = segment.audio.vo?.assetId;
                    if (assetId) removeAsset(assetId);
                  }}
                />
              </SegmentCard>
            );
          })}

          <Pressable
            accessibilityRole="button"
            onPress={addSegment}
            style={({ pressed }) => [styles.addSegment, pressed && styles.pressed]}
          >
            <Text style={styles.addSegmentLabel}>+ Add segment</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <ActionMenu
        visible={showProjectMenu}
        title={project.name}
        items={projectMenuItems}
        onDismiss={() => setShowProjectMenu(false)}
      />

      <ActionMenu
        visible={actionsFor !== null}
        title={
          actionsFor
            ? `Segment ${project.segments.findIndex((s) => s.id === actionsFor.id) + 1}`
            : undefined
        }
        items={segmentActions}
        onDismiss={() => setActionsFor(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.background, flex: 1 },
  flex: { flex: 1 },
  topBar: { alignItems: "center", flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8 },
  back: { color: theme.text, fontSize: 32, lineHeight: 34, width: 32 },
  titleBlock: { alignItems: "center", flex: 1 },
  title: { color: theme.text, fontSize: 16, fontWeight: "600" },
  titleInput: {
    borderBottomColor: "#4a7dff",
    borderBottomWidth: 1,
    color: theme.text,
    fontSize: 16,
    fontWeight: "600",
    minWidth: 160,
    paddingVertical: 2,
    textAlign: "center",
  },
  subtitle: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  overflow: { color: theme.text, fontSize: 22, textAlign: "right", width: 32 },
  previewPlaceholder: {
    alignItems: "center",
    alignSelf: "center",
    aspectRatio: 9 / 16,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    maxHeight: 260,
  },
  previewHint: { color: theme.textMuted, fontSize: 13 },
  soundtrackRow: {
    alignItems: "center",
    borderBottomColor: theme.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  soundtrackLabel: { color: theme.text, fontSize: 14 },
  soundtrackChevron: { color: theme.textMuted, fontSize: 14 },
  notice: { color: "#e0b341", fontSize: 13, paddingHorizontal: 16, paddingTop: 8 },
  list: { padding: 12, paddingBottom: 64 },
  addSegment: {
    alignItems: "center",
    borderColor: theme.border,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    paddingVertical: 16,
  },
  addSegmentLabel: { color: theme.textMuted, fontSize: 15 },
  pressed: { opacity: 0.7 },
  centered: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center" },
  error: { color: theme.danger, fontSize: 14, paddingHorizontal: 32, textAlign: "center" },
  link: { color: "#8ab4ff", fontSize: 14 },
});
