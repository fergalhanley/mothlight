import { APP_NAME } from "@mothlight/core";
import { useRouter } from "expo-router";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionMenu, type ActionMenuItem } from "@/components/ActionMenu";
import { ProjectRow } from "@/components/ProjectRow";
import { Snackbar } from "@/components/Snackbar";
import { shareProjectJson } from "@/lib/editor/exports";
import { markProjectOpened } from "@/lib/storage/prefs";
import {
  createProject,
  duplicateProject,
  loadProject,
  type ProjectSummary,
} from "@/lib/storage/projects";
import { useIncomingProjectFile } from "@/lib/storage/useIncomingProjectFile";
import { UNDO_WINDOW_MS, useProjectList } from "@/lib/storage/useProjectList";
import { theme } from "@/lib/theme";

/** Dashboard — the project list. See §2.2 of agent/v0-requirements.md. */
export default function DashboardScreen() {
  const router = useRouter();
  const {
    projects,
    broken,
    isLoading,
    error,
    refresh,
    pendingDeletion,
    requestDelete,
    undoDelete,
  } = useProjectList();

  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<ProjectSummary | null>(null);
  const [showOverflow, setShowOverflow] = useState(false);

  const [importError, setImportError] = useState<string | null>(null);

  // A project shared into the app or opened from Files lands straight in the editor.
  useIncomingProjectFile({
    onImported: (projectId) => router.push(`/project/${projectId}`),
    onError: setImportError,
  });

  // Keeps typing responsive without hand-rolling a debounce timer.
  const deferredQuery = useDeferredValue(query);

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return projects;
    // searchText is name + every script, so this matches content as well as titles.
    return projects.filter((project) => project.searchText.includes(needle));
  }, [projects, deferredQuery]);

  const openProject = useCallback(
    async (id: string) => {
      await markProjectOpened(id);
      router.push(`/project/${id}`);
    },
    [router],
  );

  const onNewProject = useCallback(async () => {
    const project = await createProject();
    await markProjectOpened(project.id);
    router.push(`/project/${project.id}`);
  }, [router]);

  const menuItems = useMemo((): ActionMenuItem[] => {
    if (!menuFor) return [];
    const target = menuFor;

    return [
      // Renaming is inline in the editor's top bar, so this just takes you there.
      { label: "Rename", onPress: () => void openProject(target.id) },
      {
        label: "Duplicate",
        onPress: async () => {
          await duplicateProject(target.id);
          await refresh();
        },
      },
      {
        label: "Export project",
        onPress: async () => {
          const project = await loadProject(target.id);
          if (project) await shareProjectJson(project);
        },
      },
      { label: "Delete", destructive: true, onPress: () => requestDelete(target) },
    ];
  }, [menuFor, openProject, refresh, requestDelete]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>{APP_NAME}</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="New project"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onNewProject}
            style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
          >
            <Text style={styles.newButtonLabel}>+</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="More"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => setShowOverflow(true)}
            style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
          >
            <Text style={styles.overflowLabel}>⋯</Text>
          </Pressable>
        </View>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search projects and scripts"
        placeholderTextColor={theme.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {importError ? <Text style={styles.error}>{importError}</Text> : null}
      {broken.length > 0 ? (
        <Text style={styles.warning}>
          {broken.length} project{broken.length === 1 ? "" : "s"} could not be opened.
        </Text>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.textMuted} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={visible.length === 0 ? styles.emptyContainer : styles.listContent}
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <ProjectRow
              summary={item}
              onOpen={() => void openProject(item.id)}
              onLongPress={() => setMenuFor(item)}
              onSwipeDismiss={() => requestDelete(item)}
            />
          )}
          ListEmptyComponent={
            deferredQuery.trim() ? (
              <Text style={styles.emptyText}>No projects match "{deferredQuery.trim()}".</Text>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nothing here yet</Text>
                <Text style={styles.emptyText}>
                  Create your first project, or import a script written by an agent.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onNewProject}
                  style={styles.emptyAction}
                >
                  <Text style={styles.emptyActionLabel}>Create your first project</Text>
                </Pressable>
              </View>
            )
          }
        />
      )}

      <ActionMenu
        visible={showOverflow}
        items={[
          { label: "Import project…", onPress: () => router.push("/import") },
          { label: "Get the agent skill", onPress: () => router.push("/import") },
        ]}
        onDismiss={() => setShowOverflow(false)}
      />

      <ActionMenu
        visible={menuFor !== null}
        title={menuFor?.name}
        items={menuItems}
        onDismiss={() => setMenuFor(null)}
      />

      {pendingDeletion ? (
        <Snackbar
          message={`"${pendingDeletion.summary.name}" deleted`}
          actionLabel="UNDO"
          onAction={undoDelete}
          durationMs={UNDO_WINDOW_MS}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.background, flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  wordmark: { color: theme.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  headerActions: { flexDirection: "row", gap: 4 },
  overflowLabel: { color: theme.text, fontSize: 22, lineHeight: 26 },
  newButton: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  newButtonPressed: { backgroundColor: theme.surface },
  newButtonLabel: { color: theme.text, fontSize: 30, lineHeight: 34 },
  search: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    color: theme.text,
    fontSize: 15,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  listContent: { paddingBottom: 96 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
  centered: { alignItems: "center", flex: 1, justifyContent: "center" },
  empty: { alignItems: "center", gap: 10, paddingHorizontal: 32 },
  emptyTitle: { color: theme.text, fontSize: 20, fontWeight: "600" },
  emptyText: { color: theme.textMuted, fontSize: 14, textAlign: "center" },
  emptyAction: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyActionLabel: { color: theme.background, fontSize: 15, fontWeight: "600" },
  error: { color: theme.danger, fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
  warning: { color: "#e0b341", fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
});
