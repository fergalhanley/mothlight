import { describe, expect, test } from "bun:test";
import { BUNDLE_IDENTIFIER, MOBILE_AUTH_CALLBACK_URL, OAUTH_PROVIDERS } from "./constants";
import { emailPasswordCredentialsSchema, oauthProviderSchema, profileSchema } from "./schemas";

describe("constants", () => {
  test("mobile OAuth callback uses the registered deep-link scheme", () => {
    expect(MOBILE_AUTH_CALLBACK_URL).toBe("mothlight://auth/callback");
  });

  test("Apple is offered alongside the other third-party providers", () => {
    expect(OAUTH_PROVIDERS).toContain("apple");
  });

  test("bundle identifier is shared by both platforms", () => {
    expect(BUNDLE_IDENTIFIER).toBe("io.mothlight.app");
  });
});

describe("schemas", () => {
  test("accepts a well-formed profile row", () => {
    const result = profileSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000000",
      display_name: "Ada",
      created_at: "2026-01-01T00:00:00+00:00",
    });
    expect(result.success).toBe(true);
  });

  test("allows a null display name", () => {
    const result = profileSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000000",
      display_name: null,
      created_at: "2026-01-01T00:00:00+00:00",
    });
    expect(result.success).toBe(true);
  });

  test("rejects a non-uuid profile id", () => {
    const result = profileSchema.safeParse({
      id: "not-a-uuid",
      display_name: "Ada",
      created_at: "2026-01-01T00:00:00+00:00",
    });
    expect(result.success).toBe(false);
  });

  test("rejects passwords shorter than 8 characters", () => {
    const result = emailPasswordCredentialsSchema.safeParse({
      email: "ada@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  test("rejects unknown OAuth providers", () => {
    expect(oauthProviderSchema.safeParse("twitter").success).toBe(false);
    expect(oauthProviderSchema.safeParse("apple").success).toBe(true);
  });
});
