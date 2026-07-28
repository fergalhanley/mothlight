/**
 * Shared constants for every Mothlight surface (mobile, web, api).
 * Keep this free of environment-specific values — those belong in each app's env config.
 */

export const APP_NAME = "Mothlight";

/** Native deep-link scheme, registered in apps/mobile/app.config.ts. */
export const DEEP_LINK_SCHEME = "mothlight";

/** Where Supabase sends the user back after an OAuth round-trip on mobile. */
export const MOBILE_AUTH_CALLBACK_URL = `${DEEP_LINK_SCHEME}://auth/callback`;

/** Path (not full URL) of the web OAuth callback route handler. */
export const WEB_AUTH_CALLBACK_PATH = "/auth/callback";

/**
 * Third-party auth providers enabled for Mothlight.
 *
 * Apple is required by App Store Review Guideline 4.8 whenever another
 * third-party sign-in option is offered, so it ships alongside Google and Facebook.
 */
export const OAUTH_PROVIDERS = ["google", "facebook", "apple"] as const;

/** iOS bundle identifier / Android applicationId. */
export const BUNDLE_IDENTIFIER = "io.mothlight.app";

/** Max length accepted for a profile display name; mirrored by the zod schema. */
export const DISPLAY_NAME_MAX_LENGTH = 50;
