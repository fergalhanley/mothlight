import { MOBILE_AUTH_CALLBACK_URL, type OAuthProvider } from "@mothlight/core";
import * as WebBrowser from "expo-web-browser";
import { getSupabaseClient } from "./supabase";

/**
 * Runs a provider sign-in in an in-app browser session and feeds the resulting code
 * back to Supabase.
 *
 * The redirect target is the app's own deep link (mothlight://auth/callback), which
 * must be allow-listed in the Supabase dashboard — see the provider checklist in the
 * root README.
 */
export async function signInWithProvider(provider: OAuthProvider) {
  const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: MOBILE_AUTH_CALLBACK_URL,
      // We drive the browser ourselves so we can capture the redirect.
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error("Supabase did not return an authorization URL");

  const result = await WebBrowser.openAuthSessionAsync(data.url, MOBILE_AUTH_CALLBACK_URL);
  if (result.type !== "success") {
    // User dismissed the sheet — not an error worth surfacing.
    return null;
  }

  return exchangeCodeFromUrl(result.url);
}

/** Pulls the PKCE `code` out of a mothlight://auth/callback URL and redeems it. */
export async function exchangeCodeFromUrl(url: string) {
  const code = new URL(url).searchParams.get("code");
  if (!code) throw new Error("Sign-in callback did not include an authorization code");

  const { data, error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.session;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: MOBILE_AUTH_CALLBACK_URL },
  });
  if (error) throw error;
  // Null session means the project requires email confirmation first.
  return data.session;
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}
