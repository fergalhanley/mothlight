import { mkdirSync } from "node:fs";
import { z } from "zod";

/** Environment contract, parsed once at startup. Documented in apps/render/.env.example. */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3002),
  /** Where finished videos are served from — must be reachable by the phone. */
  PUBLIC_BASE_URL: z.string().min(1).default("http://localhost:3002"),
  /** Scratch space for uploads and outputs. A container should mount a volume here. */
  WORKSPACE_DIR: z.string().min(1).default("/tmp/mothlight-render"),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("*")
    .transform((value) =>
      value === "*"
        ? "*"
        : value
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse({
    PORT: source.PORT,
    PUBLIC_BASE_URL: source.PUBLIC_BASE_URL,
    WORKSPACE_DIR: source.WORKSPACE_DIR,
    CORS_ALLOWED_ORIGINS: source.CORS_ALLOWED_ORIGINS,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid render service environment:\n${issues}`);
  }

  mkdirSync(parsed.data.WORKSPACE_DIR, { recursive: true });
  return parsed.data;
}
