import { describe, expect, test } from "bun:test";
import { healthResponseSchema } from "@mothlight/core";
import { createApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv({
  PORT: "3001",
  SUPABASE_URL: "http://127.0.0.1:54321",
  CORS_ALLOWED_ORIGINS: "http://localhost:3000",
} as NodeJS.ProcessEnv);

const app = createApp(env);

describe("GET /health", () => {
  test("returns 200 with a body matching the shared health schema", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    // Parsing with the @mothlight/core schema keeps the API and its clients honest.
    const body = healthResponseSchema.parse(await res.json());
    expect(body.status).toBe("ok");
    expect(body.service).toBe("Mothlight API");
  });
});

describe("GET /me", () => {
  test("rejects a request with no Authorization header", async () => {
    const res = await app.request("/me");
    expect(res.status).toBe(401);
  });

  test("rejects a non-Bearer Authorization header", async () => {
    const res = await app.request("/me", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(res.status).toBe(401);
  });

  test("rejects a malformed bearer token", async () => {
    const res = await app.request("/me", {
      headers: { Authorization: "Bearer not-a-real-jwt" },
    });
    expect(res.status).toBe(401);
  });
});

describe("unknown routes", () => {
  test("returns 404", async () => {
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("env validation", () => {
  test("rejects a missing SUPABASE_URL", () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow(/Invalid API environment/);
  });
});
