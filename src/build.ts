import { mkdir } from "node:fs/promises";
await mkdir("dist/server", { recursive: true });
for (const [entrypoint, target, outdir] of [
  ["src/client/app.ts", "browser", "dist"],
  ["src/server/index.ts", "bun", "dist/server"],
] as const) {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target,
    outdir,
    minify: true,
    external: target === "bun" ? ["bun:sqlite"] : [],
  });
  if (!result.success) throw new Error(result.logs.join("\n"));
}
await Bun.write("dist/server/schema.sql", Bun.file("src/server/schema.sql"));
console.log("Built studio client and Bun server.");
