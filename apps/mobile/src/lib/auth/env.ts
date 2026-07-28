import Constants from "expo-constants";

/**
 * Supabase configuration. See ./README.md — dormant in v0.
 *
 * Read lazily rather than at module scope: v0 ships with no Supabase environment at all,
 * and an accidental import must not be able to crash the app at startup.
 *
 * Prefers the inlined `EXPO_PUBLIC_*` values, falling back to `extra` from
 * app.config.ts (which is what release builds carry).
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

export function supabaseUrl(): string {
  return required(
    "EXPO_PUBLIC_SUPABASE_URL",
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? readExtra("supabaseUrl"),
  );
}

export function supabaseAnonKey(): string {
  return required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? readExtra("supabaseAnonKey"),
  );
}

/** True when the app has enough configuration to talk to Supabase at all. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.EXPO_PUBLIC_SUPABASE_URL ?? readExtra("supabaseUrl")) &&
      (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? readExtra("supabaseAnonKey")),
  );
}
