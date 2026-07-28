import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import type { Env } from "../env";

/** Variables the auth middleware puts on the Hono context. */
export type AuthVariables = {
  userId: string;
  userEmail: string | undefined;
};

/** Supabase issues access tokens with this audience for signed-in end users. */
const SUPABASE_AUDIENCE = "authenticated";

/**
 * A remote JWKS fetches and caches signing keys, so it must be created once per
 * process rather than per request.
 */
const jwksCache = new Map<string, JWTVerifyGetKey>();

function getRemoteJwks(supabaseUrl: string): JWTVerifyGetKey {
  const cached = jwksCache.get(supabaseUrl);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  jwksCache.set(supabaseUrl, jwks);
  return jwks;
}

function extractBearerToken(header: string | undefined): string {
  if (!header) {
    throw new HTTPException(401, { message: "Missing Authorization header" });
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new HTTPException(401, { message: "Expected an 'Authorization: Bearer <token>' header" });
  }

  return token;
}

/**
 * Verifies a Supabase access token and exposes the caller's id on the context.
 *
 * Two verification modes, chosen by configuration:
 *   - `SUPABASE_JWT_SECRET` set  → HS256 against the project's symmetric secret (legacy projects)
 *   - otherwise                  → the project's JWKS endpoint (asymmetric signing keys)
 */
export function requireAuth(env: Env) {
  const issuer = `${env.SUPABASE_URL}/auth/v1`;
  const secretKey = env.SUPABASE_JWT_SECRET
    ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
    : undefined;

  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const token = extractBearerToken(c.req.header("Authorization"));
    const options = { issuer, audience: SUPABASE_AUDIENCE };

    let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
    try {
      const result = secretKey
        ? await jwtVerify(token, secretKey, options)
        : await jwtVerify(token, getRemoteJwks(env.SUPABASE_URL), options);
      payload = result.payload;
    } catch {
      // Deliberately opaque: never leak why verification failed.
      throw new HTTPException(401, { message: "Invalid or expired token" });
    }

    if (!payload.sub) {
      throw new HTTPException(401, { message: "Token is missing a subject claim" });
    }

    c.set("userId", payload.sub);
    c.set("userEmail", typeof payload.email === "string" ? payload.email : undefined);

    await next();
  });
}
