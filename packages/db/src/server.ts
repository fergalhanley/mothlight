import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Cookie adapter the host framework must supply. In Next.js this is backed by
 * `cookies()` from `next/headers` — see apps/web/src/lib/supabase/server.ts.
 */
export type CookieAdapter = Parameters<typeof createServerClient>[2]["cookies"];

/**
 * Supabase client for server-side rendering: server components, route handlers,
 * and server actions. Reads and refreshes the session from cookies.
 */
export function createServerSupabaseClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  cookies: CookieAdapter,
) {
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, { cookies });
}
