import { useEffect, useState } from "react";
import { seedDemoProjectIfNeeded } from "./storage/demo";
import { ensureProjectsDirectory } from "./storage/paths";

/**
 * First-run work, done behind the splash: make sure the projects directory exists and
 * seed the demo tour if this is a fresh install.
 *
 * Schema migrations run per-project on read (see storage/projects.ts) rather than as a
 * startup sweep, so a large library does not pay for them all at once.
 */

export type BootstrapState = { isReady: boolean; error: string | null };

export async function bootstrap(): Promise<void> {
  ensureProjectsDirectory();
  await seedDemoProjectIfNeeded();
}

export function useBootstrap(): BootstrapState {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    bootstrap()
      .catch((cause: unknown) => {
        // A failed seed must not block the app — an empty dashboard still works.
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not prepare local storage.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { isReady, error };
}
