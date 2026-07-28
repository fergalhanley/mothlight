import { z } from "zod";

/**
 * Environment contract for the API. Parsed once at startup so a misconfigured
 * deployment fails immediately and loudly rather than on the first request.
 * Every variable here is documented in apps/api/.env.example.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  /** Set for legacy HS256 projects. When empty, tokens are verified via JWKS. */
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

function emptyToUndefined(value: string | undefined) {
  return value && value.length > 0 ? value : undefined;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse({
    PORT: source.PORT,
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: emptyToUndefined(source.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_JWT_SECRET: emptyToUndefined(source.SUPABASE_JWT_SECRET),
    CORS_ALLOWED_ORIGINS: source.CORS_ALLOWED_ORIGINS,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid API environment:\n${issues}\n\nSee apps/api/.env.example`);
  }

  return parsed.data;
}
