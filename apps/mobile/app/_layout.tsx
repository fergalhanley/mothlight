import { APP_NAME } from "@mothlight/core";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useBootstrap } from "@/lib/bootstrap";
import { theme } from "@/lib/theme";

/**
 * Root layout.
 *
 * There is deliberately no session guard: v0 has no accounts, so the app opens straight
 * to the dashboard. The Supabase auth wiring is kept dormant under src/lib/auth — see
 * the README there.
 */
export default function RootLayout() {
  const { isReady } = useBootstrap();

  return (
    // Required by react-native-gesture-handler, which drives swipe-to-delete.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {isReady ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="project/[id]" />
            <Stack.Screen name="import" />
          </Stack>
        ) : (
          <Splash />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Held only while the first-run seed runs — normally a single frame. */
function Splash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.wordmark}>{APP_NAME}</Text>
      <ActivityIndicator color={theme.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: theme.background, flex: 1 },
  splash: {
    alignItems: "center",
    backgroundColor: theme.background,
    flex: 1,
    gap: 24,
    justifyContent: "center",
  },
  wordmark: { color: theme.text, fontSize: 32, fontWeight: "700", letterSpacing: -0.5 },
});
