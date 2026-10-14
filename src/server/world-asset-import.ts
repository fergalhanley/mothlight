export const ASSET_KINDS = ["character", "location", "prop", "costume", "style", "voice"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export type WorldAsset = {
  kind: AssetKind;
  name: string;
  description: string;
  prompt: string;
  continuity: string;
};
export type WorldAssetPack = { version: 1; title: string; assets: WorldAsset[] };

export const assetKey = (kind: string, name: string) =>
  kind.toLowerCase() + "\u0000" + name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");

export function parseWorldAssetPack(text: string): WorldAssetPack {
  if (typeof text !== "string" || !text.trim() || text.length > 1_000_000)
    throw new Error("Choose an asset pack JSON file up to 1 MB.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("World asset pack is not valid JSON.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("World asset pack must be a JSON object.");
  const root = data as Record<string, unknown>;
  if (Object.keys(root).some(k => !["version", "title", "assets"].includes(k)))
    throw new Error("Unrecognised field in world asset pack.");
  if (root.version !== 1) throw new Error("Unsupported asset pack version (expected 1).");
  if (typeof root.title !== "string" || !root.title.trim() || root.title.length > 200)
    throw new Error("Asset pack title is required (maximum 200 characters).");
  if (!Array.isArray(root.assets) || root.assets.length < 1 || root.assets.length > 200)
    throw new Error("Asset pack must contain 1 to 200 assets.");
  const seen = new Set<string>();
  const assets: WorldAsset[] = root.assets.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Asset " + (i + 1) + " must be an object.");
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some(k => !["kind", "name", "description", "prompt", "continuity"].includes(k)))
      throw new Error("Unknown field in asset " + (i + 1) + ".");
    if (typeof item.kind !== "string" || !(ASSET_KINDS as readonly string[]).includes(item.kind))
      throw new Error("Asset " + (i + 1) + ": invalid kind.");
    if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 500)
      throw new Error("Asset " + (i + 1) + ": name is required (maximum 500 characters).");
    for (const key of ["description", "prompt", "continuity"]) {
      if (typeof item[key] !== "string" || item[key].length > 100_000)
        throw new Error("Asset " + (i + 1) + ": " + key + " must be text (maximum 100,000 characters).");
    }
    const key = assetKey(item.kind, item.name);
    if (seen.has(key))
      throw new Error("Duplicate asset in pack: " + item.kind + " / " + item.name);
    seen.add(key);
    return {
      kind: item.kind as AssetKind,
      name: item.name.trim(),
      description: item.description as string,
      prompt: item.prompt as string,
      continuity: item.continuity as string,
    };
  });
  return { version: 1, title: root.title.trim(), assets };
}
