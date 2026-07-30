import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/site";

/**
 * The card that shows when a link to the site is shared.
 *
 * Node runtime because it reads the moth artwork off disk at build time — the whole point
 * of the card is the moth, and re-drawing it in CSS would be a worse likeness.
 */
export const runtime = "nodejs";
export const alt = `${SITE_NAME} — short videos, made on your phone`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const iconPath = path.join(process.cwd(), "src/app/assets/mothlight-icon.png");
  const moth = await readFile(iconPath);
  const mothSrc = `data:image/png;base64,${moth.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 56,
        padding: "0 80px",
        background: "#0a0908",
        color: "#ede9e4",
        fontFamily: "sans-serif",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: Satori renders plain img, not next/image. */}
      <img src={mothSrc} alt="" width={400} height={400} />

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 600 }}>
        <div style={{ fontSize: 68, fontWeight: 700, letterSpacing: -2 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 34, lineHeight: 1.3, color: "#9c948b" }}>
          Short videos, made on your phone.
        </div>

        {/* The wing spectrum, same order as the artwork. */}
        <div style={{ display: "flex", height: 6, width: 420, marginTop: 8 }}>
          {["#5d4399", "#e16595", "#f5b673", "#7ad437"].map((colour) => (
            <div key={colour} style={{ flex: 1, background: colour }} />
          ))}
        </div>

        <div style={{ fontSize: 24, color: "#6b645d", marginTop: 4 }}>{SITE_DOMAIN}</div>
      </div>
    </div>,
    size,
  );
}
