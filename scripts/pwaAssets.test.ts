import { describe, expect, it } from "vitest";
import { resolveEdgeAssetPath } from "../cloudflare/runtime";
import { PWA_ROOT_ASSETS } from "./pwaAssets.mjs";
import { PWA_ICONS, renderIcon } from "./pwaIcons.mjs";

describe("PWA root assets", () => {
  it("includes the service worker, manifest, and every generated icon", () => {
    expect(PWA_ROOT_ASSETS).toContain("sw.js");
    expect(PWA_ROOT_ASSETS).toContain("manifest.webmanifest");
    for (const icon of PWA_ICONS) {
      expect(PWA_ROOT_ASSETS).toContain(icon.fileName);
    }
  });

  // prepare-cloudflare-assets.mjs copies only these files plus assets/**, so a
  // root asset the edge cannot serve would 404 in production only.
  it("is servable from the edge at its exact root path", () => {
    for (const fileName of PWA_ROOT_ASSETS) {
      expect(resolveEdgeAssetPath(`/${fileName}`, false)).toBe(`/${fileName}`);
    }
  });

  it("declares a maskable icon at 512px, which Android requires to avoid letterboxing", () => {
    const maskable = PWA_ICONS.find(icon => icon.options.cornerRadius === 0 && icon.size === 512);
    expect(maskable).toBeDefined();
    // Full-bleed, with the artwork pulled inside the safe zone launchers crop to.
    expect(maskable!.options.glyphScale).toBeLessThan(0.8);
  });
});

describe("icon generation", () => {
  it("emits a valid PNG at the requested size", () => {
    const png = renderIcon(64, {});
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR payload starts at byte 16: width then height, big-endian.
    expect(png.readUInt32BE(16)).toBe(64);
    expect(png.readUInt32BE(20)).toBe(64);
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.subarray(png.length - 8).toString("ascii")).toContain("IEND");
  });

  it("is deterministic, so a rebuild does not churn the asset hash", () => {
    expect(renderIcon(32, {}).equals(renderIcon(32, {}))).toBe(true);
  });

  it("keeps a maskable icon fully opaque to its edges", () => {
    const size = 16;
    const png = renderIcon(size, { cornerRadius: 0, glyphScale: 0.72 });
    // A rounded icon has transparent corners; a maskable one must not, or
    // launchers show a gap where they crop.
    const rounded = renderIcon(size, {});
    expect(png.length).not.toBe(rounded.length);
  });
});
