import { test, expect } from "bun:test";
import { parseWorldAssetPack, assetKey } from "../src/server/world-asset-import";

const sample = {
  version: 1, title: "The Forecast World",
  assets: [
    { kind: "character", name: "Ryan Altair", description: "A young hacker.", prompt: "Dark hair, expressive eyes.", continuity: "Keep exact look." },
    { kind: "prop", name: "Family photograph", description: "Framed.", prompt: "Four people.", continuity: "Same portrait." },
  ],
};
test("asset pack v1 preserves details and distinguishes asset types", () => {
  const pack = parseWorldAssetPack(JSON.stringify(sample));
  expect(pack.title).toBe("The Forecast World");
  expect(pack.assets).toHaveLength(2);
  expect(pack.assets[0].continuity).toBe("Keep exact look.");
  expect(assetKey("character", " Ryan  Altair ")).toBe(assetKey("CHARACTER", "ryan altair"));
  expect(assetKey("prop", "Ryan Altair")).not.toBe(assetKey("character", "Ryan Altair"));
});
test("asset pack rejects malformed, duplicate, or unsupported data", () => {
  expect(() => parseWorldAssetPack("garbage")).toThrow("valid JSON");
  expect(() => parseWorldAssetPack(JSON.stringify({ ...sample, version: 2 }))).toThrow("version");
  expect(() => parseWorldAssetPack(JSON.stringify({ ...sample, assets: [] }))).toThrow("1 to 200");
  expect(() => parseWorldAssetPack(JSON.stringify({ ...sample, assets: [
    ...sample.assets, { ...sample.assets[0], name: " ryan  altair " },
  ] }))).toThrow("Duplicate");
  expect(() => parseWorldAssetPack(JSON.stringify({ ...sample, assets: [
    { ...sample.assets[0], unknownField: "should not be ignored" },
  ] }))).toThrow("Unknown field");
});
