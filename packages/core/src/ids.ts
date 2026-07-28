/**
 * Local id generation.
 *
 * These ids only need to be unique within a single project file, so they are
 * deliberately dependency-free: `crypto.randomUUID` is not reliably present on Hermes,
 * and pulling expo-crypto into @mothlight/core would make this package unusable from
 * the web app and the render worker. Nothing here is security-sensitive.
 */

const HEX = "0123456789abcdef";

function randomHex(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += HEX[Math.floor(Math.random() * 16)];
  }
  return out;
}

/** A v4-shaped UUID. Random, not cryptographically strong. */
export function createUuid(): string {
  const variant = HEX[8 + Math.floor(Math.random() * 4)];
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variant}${randomHex(3)}-${randomHex(12)}`;
}

/** A short prefixed id, e.g. `seg_l9x2f4a1`. Used for segments, overlays, and assets. */
export function createId(prefix: string): string {
  const time = Date.now().toString(36);
  return `${prefix}_${time}${randomHex(4)}`;
}
