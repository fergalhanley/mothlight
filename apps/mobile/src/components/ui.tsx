import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/lib/theme";

/** Deliberately plain primitives — swap for the design system when it exists. */

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Caption({ children }: { children: ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={theme.textMuted} style={styles.field} {...props} />;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  busy?: boolean;
};

export function Button({ label, onPress, variant = "primary", disabled, busy }: ButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || busy) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? theme.background : theme.text} />
      ) : (
        <Text style={isPrimary ? styles.buttonPrimaryLabel : styles.buttonSecondaryLabel}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { flex: 1, justifyContent: "center", gap: 12, padding: 24 },
  heading: { color: theme.text, fontSize: 28, fontWeight: "600", marginBottom: 4 },
  caption: { color: theme.textMuted, fontSize: 14, textAlign: "center" },
  error: { color: theme.danger, fontSize: 14 },
  field: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 10,
    borderWidth: 1,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    alignItems: "center",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  buttonPrimary: { backgroundColor: theme.accent },
  buttonSecondary: { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.8 },
  buttonPrimaryLabel: { color: theme.background, fontSize: 16, fontWeight: "600" },
  buttonSecondaryLabel: { color: theme.text, fontSize: 16, fontWeight: "500" },
});
