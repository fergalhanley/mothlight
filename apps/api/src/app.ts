import { APP_NAME } from "@mothlight/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { Env } from "./env";
import { type AuthVariables, requireAuth } from "./middleware/auth";

export type AppBindings = { Variables: AuthVariables };

const startedAt = Date.now();

/**
 * Builds the Hono app. Kept separate from the server entry point so tests can
 * exercise routes with `app.request(...)` without binding a port.
 */
export function createApp(env: Env) {
  const app = new Hono<AppBindings>();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: env.CORS_ALLOWED_ORIGINS,
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );

  // Liveness probe — unauthenticated by design.
  app.get("/health", (c) =>
    c.json({
      status: "ok" as const,
      service: `${APP_NAME} API`,
      uptime: (Date.now() - startedAt) / 1000,
    }),
  );

  // Example protected route: proves the JWT middleware is wired end to end.
  app.get("/me", requireAuth(env), (c) => c.json({ userId: c.get("userId") }));

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error("Unhandled API error:", err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
