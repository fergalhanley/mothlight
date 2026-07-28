import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Supabase client for Next.js **client** components.
 * Session is persisted in cookies so the server helpers can read it too.
 */
export function createBrowserSupabaseClient(supabaseUrl: string, supabaseAnonKey: string) {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
