import type { ExpoConfig } from "expo/config";

/**
 * Expo config for the Mothlight app.
 *
 * This is a **custom dev client** setup, not Expo Go: native modules (RevenueCat and
 * friends) will be added later, so run `bun run ios` / `bun run android` to build and
 * install the dev client, then `bun run start` to attach the bundler to it.
 */

// Keep in sync with @mothlight/core: BUNDLE_IDENTIFIER and DEEP_LINK_SCHEME.
// Duplicated as literals because app.config.ts is evaluated by the Expo CLI outside
// the TypeScript path mapping used by the app bundle.
const BUNDLE_IDENTIFIER = "app.mothlight";
const SCHEME = "mothlight";

const config: ExpoConfig = {
  name: "Mothlight",
  slug: "mothlight",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  // Dark-only for now, matching the web marketing site.
  userInterfaceStyle: "dark",

  // Registers mothlight:// so Supabase can redirect back after OAuth
  // (mothlight://auth/callback).
  scheme: SCHEME,

  ios: {
    bundleIdentifier: BUNDLE_IDENTIFIER,
    supportsTablet: false,
  },

  android: {
    package: BUNDLE_IDENTIFIER,
    adaptiveIcon: {
      backgroundColor: "#0a0a0a",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },

  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },

  plugins: ["expo-router", "expo-secure-store", "expo-web-browser"],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    // Surfaced to the app via expo-constants; see src/lib/env.ts.
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default config;
