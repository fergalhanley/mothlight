import path from "node:path";
import type { NextConfig } from "next";

/**
 * Monorepo configuration.
 *
 * Both settings exist because the site is built from `apps/web` while the code it depends
 * on lives above it — locally that works through the workspace symlink, and on Vercel
 * (where the Root Directory is apps/web) it would not.
 */
const nextConfig: NextConfig = {
  /**
   * @mothlight/core ships raw TypeScript — its `main` is `./src/index.ts`, deliberately,
   * so the app, the render worker, and this site all consume one source of truth without
   * a build step. Next has to compile it rather than treat it as a prebuilt dependency.
   */
  transpilePackages: ["@mothlight/core"],

  /**
   * File tracing has to start at the repo root, or the deployment misses the workspace
   * packages and the lockfile that resolves them.
   */
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default nextConfig;
