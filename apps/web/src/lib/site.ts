/**
 * Site-wide constants.
 *
 * The contact address and the domain both end up in store listings, where they are
 * effectively permanent — so they live in one place rather than being retyped per page.
 */

export const SITE_NAME = "Mothlight";
export const SITE_DOMAIN = "mothlight.app";
export const SITE_URL = `https://${SITE_DOMAIN}`;

export const CONTACT_EMAIL = "developer@mothlight.app";

/** The company behind Mothlight, credited in the footer. */
export const COMPANY_NAME = "Visarc";
export const COMPANY_URL = "https://visarc.com.au";

/** Shown on the privacy page and used for "last updated". Bump when the policy changes. */
export const PRIVACY_EFFECTIVE_DATE = "30 July 2026";

/**
 * `short` is used in the header, where the full label wraps and collides with the
 * wordmark on a phone. The footer has room for the long form.
 */
export const NAV_LINKS = [
  { href: "/agent", label: "Write with an agent", short: "Agent" },
  { href: "/support", label: "Support", short: "Support" },
  { href: "/privacy", label: "Privacy", short: "Privacy" },
] as const;
