import Constants from "expo-constants";

/**
 * Resolves public config, preferring the inlined `EXPO_PUBLIC_*` values and falling
 * back to `extra` from app.config.ts (which is what release builds carry).
 * Documented in apps/mobile/.env.example.
 */
function readExtra(key: string): string | undefined {
  const value = Constants.expoConfig?.extra?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy apps/mobile/.env.example to .env and fill it in.`);
  }
  return value;
}

export const supabaseUrl = required(
  "EXPO_PUBLIC_SUPABASE_URL",
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? readExtra("supabaseUrl"),
);

export const supabaseAnonKey = required(
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? readExtra("supabaseAnonKey"),
);
