import type { ExpoConfig } from "expo/config";

/**
 * Expo config for the Mothlight app.
 *
 * This is a **custom dev client** setup, not Expo Go: native modules (RevenueCat and
 * friends) will be added later, so run `bun run ios` / `bun run android` to build and
 * install the dev client, then `bun run start` to attach the bundler to it.
 *
 * Every permission below carries a purpose string. A missing one is an instant store
 * rejection, so they are declared here rather than left to plugin defaults, and they are
 * requested in context at point of use — never as a wall on launch.
 */

// Keep in sync with @mothlight/core: BUNDLE_IDENTIFIER and DEEP_LINK_SCHEME.
// Duplicated as literals because app.config.ts is evaluated by the Expo CLI outside
// the TypeScript path mapping used by the app bundle.
const BUNDLE_IDENTIFIER = "app.mothlight";
const SCHEME = "mothlight";

const PHOTOS_READ_PERMISSION =
  "Mothlight needs access to your photos and videos so you can use them in your projects.";
const PHOTOS_WRITE_PERMISSION = "Mothlight saves finished videos to your photo library.";
const MICROPHONE_PERMISSION = "Mothlight uses the microphone to record voiceovers for your videos.";

const config: ExpoConfig = {
  name: "Mothlight",
  slug: "mothlight",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  // Dark-only for now, matching the web marketing site.
  userInterfaceStyle: "dark",

  // Registers mothlight:// for deep links. Also the OAuth redirect target if and when
  // the dormant Supabase auth is revived (mothlight://auth/callback).
  scheme: SCHEME,

  ios: {
    bundleIdentifier: BUNDLE_IDENTIFIER,
    // Universal app: one bundle ID covers iPhone and iPad, so there is one listing.
    supportsTablet: true,
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

  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-web-browser",
    "expo-sharing",
    "expo-image",
    "expo-video",
    [
      "expo-image-picker",
      {
        photosPermission: PHOTOS_READ_PERMISSION,
        // v0 never opens the camera — adding a visual means picking an existing one.
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: PHOTOS_READ_PERMISSION,
        savePhotosPermission: PHOTOS_WRITE_PERMISSION,
        isAccessMediaLocationEnabled: false,
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission: MICROPHONE_PERMISSION,
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    // Dormant Supabase auth only; v0 does not read these. See src/lib/auth/README.md.
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default config;
