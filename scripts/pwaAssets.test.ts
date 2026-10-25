import { describe, expect, it } from "vitest";
import { resolveEdgeAssetPath } from "../cloudflare/runtime";
import { PWA_ROOT_ASSETS } from "./pwaAssets.mjs";
import { PWA_ICONS, buildPwaIcons } from "./pwaIcons.mjs";

describe("PWA root assets", () => {
  it("includes the service worker, manifest, and every icon", () => {
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
    expect(PWA_ICONS.find(icon => icon.fileName === "pwa-maskable-512.png")?.size).toBe(512);
  });
});

describe("icon files", () => {
  const icons = buildPwaIcons();

  it("ships every PNG icon at the size its name and manifest entry declare", () => {
    for (const spec of PWA_ICONS.filter(icon => icon.contentType === "image/png")) {
      const png = icons.find(icon => icon.fileName === spec.fileName)!.contents;
      expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      // IHDR payload starts at byte 16: width then height, big-endian.
      expect(png.readUInt32BE(16)).toBe(spec.size);
      expect(png.readUInt32BE(20)).toBe(spec.size);
    }
  });

  it("ships a real .ico for browsers that request /favicon.ico directly", () => {
    const ico = icons.find(icon => icon.fileName === "favicon.ico")!.contents;
    // ICONDIR header: reserved 0, type 1 (icon), then at least one image.
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThan(0);
  });

  it("ships an SVG favicon without scripts", () => {
    const svg = icons.find(icon => icon.fileName === "favicon.svg")!.contents.toString("utf8");
    expect(svg).toMatch(/^<svg[\s>]/);
    expect(svg).not.toMatch(/<script|\son\w+=/i);
  });
});
