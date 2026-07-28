import { createBrowserSupabaseClient } from "@mothlight/db/browser";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Supabase client for use inside client components. */
export function createClient() {
  return createBrowserSupabaseClient(supabaseUrl(), supabaseAnonKey());
}
