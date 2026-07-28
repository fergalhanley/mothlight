import { createServerSupabaseClient } from "@mothlight/db/server";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Supabase client for server components, route handlers, and server actions.
 *
 * `cookies()` is async in Next.js 15+, so this factory is async too.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerSupabaseClient(supabaseUrl(), supabaseAnonKey(), {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Server Components cannot write cookies. Safe to ignore: src/proxy.ts
        // refreshes the session on every request, so the cookies stay current.
      }
    },
  });
}
