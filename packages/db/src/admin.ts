import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses Row Level Security entirely.
 *
 * Use ONLY in trusted server-side code (apps/api). Never ship the service-role key
 * to the browser or to the mobile bundle.
 */
export function createAdminClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
