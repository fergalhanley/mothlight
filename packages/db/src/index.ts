/**
 * Shared Supabase types and generic client factory.
 *
 * Platform-specific factories live in sibling entry points so that, for example, an
 * Expo bundle never pulls in the cookie-based `@supabase/ssr` helpers:
 *
 *   `@mothlight/db/browser` — Next.js client components
 *   `@mothlight/db/server`  — Next.js server components / route handlers
 *   `@mothlight/db/admin`   — service-role client for trusted server code only
 *
 * The mobile app builds its own client (SecureStore-backed) and imports only the types.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./database.types";
export type MothlightSupabaseClient = SupabaseClient<Database>;

/** A plain, unauthenticated client. Callers supply the URL and anon key. */
export function createAnonClient(supabaseUrl: string, supabaseAnonKey: string) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}
