import { z } from "zod";
import { DISPLAY_NAME_MAX_LENGTH, OAUTH_PROVIDERS } from "./constants";

/** OAuth providers Mothlight supports, as a runtime-validatable enum. */
export const oauthProviderSchema = z.enum(OAUTH_PROVIDERS);
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

/** Mirrors the `public.profiles` table created in supabase/migrations. */
export const profileSchema = z.object({
  id: z.uuid(),
  display_name: z.string().min(1).max(DISPLAY_NAME_MAX_LENGTH).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});
export type Profile = z.infer<typeof profileSchema>;

export const emailPasswordCredentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type EmailPasswordCredentials = z.infer<typeof emailPasswordCredentialsSchema>;

/** Response body of the API's example protected route, `GET /me`. */
export const meResponseSchema = z.object({
  userId: z.uuid(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Response body of `GET /health`. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  uptime: z.number(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
