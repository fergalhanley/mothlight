import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/lib/theme";

/**
 * A bottom sheet of actions, used for long-press context menus and overflow menus.
 *
 * Written rather than using `Alert`: Android caps alerts at three buttons and the
 * project context menu has four.
 */

export type ActionMenuItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

export function ActionMenu({
  visible,
  title,
  items,
  onDismiss,
}: {
  visible: boolean;
  title?: string;
  items: ActionMenuItem[];
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Dismiss menu">
        {/* Swallows taps so pressing the sheet itself does not close it. */}
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]} onPress={() => {}}>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}

          {items.map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item.label}
              onPress={() => {
                onDismiss();
                item.onPress();
              }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Text style={[styles.itemLabel, item.destructive && styles.destructive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}

          <View style={styles.separator} />

          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
  },
  title: {
    color: theme.textMuted,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  item: { paddingHorizontal: 20, paddingVertical: 16 },
  itemPressed: { backgroundColor: theme.border },
  itemLabel: { color: theme.text, fontSize: 16 },
  destructive: { color: theme.danger },
  cancelLabel: { color: theme.textMuted, fontSize: 16 },
  separator: { backgroundColor: theme.border, height: StyleSheet.hairlineWidth, marginTop: 4 },
});
