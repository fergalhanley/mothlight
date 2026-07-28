import type { Database } from "@mothlight/db/types";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Session storage backed by the device keychain / keystore.
 *
 * Caveat: SecureStore rejects values larger than 2048 bytes on Android. A Supabase
 * session comfortably fits today, but if you add large custom JWT claims you will need
 * to chunk the value across multiple keys.
 */
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // SecureStore is unavailable on web; fall back to the default (localStorage).
    ...(Platform.OS === "web" ? {} : { storage: secureStoreAdapter }),
    autoRefreshToken: true,
    persistSession: true,
    // Native apps receive the OAuth code via a deep link, not a page URL.
    detectSessionInUrl: false,
  },
});

// Only refresh tokens while the app is in the foreground; otherwise the timer keeps
// the device awake for no reason.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
