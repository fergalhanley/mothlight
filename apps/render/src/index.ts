import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { sweepExpiredJobs } from "./jobs";
import { warmBundle } from "./render";

const env = loadEnv();
const app = createApp(env);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`Mothlight render service listening on port ${info.port}`);
});

// Bundling the composition takes a while; do it at boot so the first user does not wait
// for webpack on top of their render.
void warmBundle().then(
  () => console.info("Remotion bundle ready"),
  (error: unknown) => console.error("Failed to build the Remotion bundle:", error),
);

// Finished jobs hold on to their uploads and output until swept.
setInterval(
  () => {
    const removed = sweepExpiredJobs();
    if (removed > 0) console.info(`Swept ${removed} expired render job(s)`);
  },
  10 * 60 * 1000,
).unref();
