import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / PKCE callback.
 *
 * Supabase redirects here with a `code` query parameter after the user completes a
 * provider sign-in. We exchange it for a session, which `createClient` writes into
 * cookies, then send the user on to their destination.
 *
 * Register this URL in the Supabase dashboard under Authentication → URL Configuration
 * (see the provider checklist in the root README).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error?reason=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error?reason=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/**
 * Only allow same-site relative paths. Without this check, `?next=https://evil.example`
 * would turn the callback into an open redirect.
 */
function safeRedirectPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}
