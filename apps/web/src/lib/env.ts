/**
 * Environment access for the web app.
 *
 * `NEXT_PUBLIC_*` variables must be referenced as static property accesses so the
 * Next.js compiler can inline them at build time — never build the key dynamically.
 *
 * Reads are lazy (functions, not module-level constants) so that `next build` succeeds
 * on a machine without a populated .env.local; a missing variable fails at request time
 * with a clear message instead. Every variable is documented in apps/web/.env.example.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See apps/web/.env.example`);
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Public origin of this site, used to build absolute OAuth redirect URLs. */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
