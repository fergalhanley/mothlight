/** Display formatting shared by the dashboard and editor. Pure and locale-agnostic. */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Coarse relative time for dashboard rows: "just now", "12 minutes ago", "yesterday".
 *
 * Deliberately blunt — nobody reading a project list cares about the difference between
 * 61 and 74 minutes, and precision here reads as clutter.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const elapsed = now.getTime() - then;
  if (elapsed < 0) return "just now";

  if (elapsed < MINUTE_MS) return "just now";

  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return "yesterday";
  if (elapsed < WEEK_MS) return `${days} days ago`;

  const weeks = Math.floor(elapsed / WEEK_MS);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;

  return new Date(iso).toLocaleDateString();
}

/** "6 segments", "1 segment". */
export function formatSegmentCount(count: number): string {
  return `${count} segment${count === 1 ? "" : "s"}`;
}
