import type { Row } from "./db";
import { mediaPath } from "./worker";
/** Byte ranges are required for reliable seeking in imported clips and rough cuts. */
export function mediaResponse(req: Request, media: Row): Response {
  const file = Bun.file(mediaPath(media));
  const size = file.size;
  const headers: Record<string, string> = {
    "Content-Type": media.mime,
    "Content-Length": String(size),
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.filename)}`,
  };
  const range = req.headers.get("range");
  if (!range || req.method === "HEAD")
    return new Response(req.method === "HEAD" ? null : file, { headers });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2]))
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[1]
    ? match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1
    : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start ||
    (!match[1] && Number(match[2]) === 0)
  )
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  headers["Content-Length"] = String(end - start + 1);
  return new Response(file.slice(start, end + 1), { status: 206, headers });
}
