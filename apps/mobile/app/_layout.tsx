import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { theme } from "@/lib/theme";

/**
 * Root layout.
 *
 * There is deliberately no session guard: v0 has no accounts, so the app opens straight
 * to the dashboard. The Supabase auth wiring is kept dormant under src/lib/auth — see
 * the README there.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </SafeAreaProvider>
  );
}
