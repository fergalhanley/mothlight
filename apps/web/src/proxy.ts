import { createServerSupabaseClient } from "@mothlight/db/server";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Next.js 16 renamed Middleware to Proxy; the behaviour is unchanged.
 *
 * Its only job here is to refresh the Supabase session on each request so that
 * server components always observe a valid access token. Do not put authorization
 * logic in this file — do that check in the page or route handler itself.
 */
export async function proxy(request: NextRequest) {
  // Must be mutated (not recreated) so refreshed auth cookies survive.
  let response = NextResponse.next({ request });

  const supabase = createServerSupabaseClient(supabaseUrl(), supabaseAnonKey(), {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet) {
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value);
      }
      response = NextResponse.next({ request });
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options);
      }
    },
  });

  // Touching getUser() is what triggers the refresh.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets and image optimization; they never need a session refresh.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
