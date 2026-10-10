import { api, json } from "./api";
import { HttpError } from "./auth";
import { startWorker } from "./worker";
const hosted = process.env.MOTHLIGHT_HOSTED === "true";
if (hosted && !process.env.MOTHLIGHT_ORIGIN?.startsWith("https://"))
  throw new Error("Hosted mode requires an HTTPS MOTHLIGHT_ORIGIN.");
const build = await Bun.build({
  entrypoints: ["src/client/app.ts"],
  target: "browser",
  minify: true,
});
if (!build.success) throw new Error(build.logs.join("\n"));
const appJs = await build.outputs[0].text();
const headers = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
export async function handle(req: Request) {
  try {
    const u = new URL(req.url);
    if (!hosted) {
      requireLocalHost(u.hostname);
    }
    let response: Response;
    if (u.pathname.startsWith("/api/")) response = await api(req);
    else if (u.pathname === "/app.js")
      response = new Response(appJs, {
        headers: { "Content-Type": "text/javascript" },
      });
    else if (u.pathname === "/styles.css")
      response = new Response(Bun.file("src/client/styles.css"), {
        headers: { "Content-Type": "text/css" },
      });
    else if (u.pathname === "/" && req.method === "GET")
      response = new Response(Bun.file("src/client/index.html"), {
        headers: { "Content-Type": "text/html" },
      });
    else response = json({ error: "Not found." }, 404);
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
    return response;
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return json(
      {
        error:
          e instanceof HttpError ? e.message : "An unexpected error occurred.",
      },
      e instanceof HttpError ? e.status : 500,
      headers,
    );
  }
}
function requireLocalHost(host: string) {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
    throw new HttpError(
      403,
      "Local mode only accepts localhost. Use hosted mode for network access.",
    );
}
if (import.meta.main) {
  startWorker();
  const server = Bun.serve({
    hostname: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT) || 3000,
    maxRequestBodySize: 501 * 1024 * 1024,
    idleTimeout: 255,
    fetch: handle,
  });
  console.log(`Mothlight studio → ${server.url}`);
}
