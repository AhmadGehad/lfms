import { PWA_ICONS } from "./pwaIcons.mjs";

/**
 * Root-level files the tenant PWA needs at fixed URLs.
 *
 * These live at the dist root rather than under `assets/`, so the asset-tree
 * copy in prepare-cloudflare-assets.mjs skips them — they have to be copied
 * explicitly or the app silently loses installability and offline support in
 * production only. The icon names are derived from PWA_ICONS so the two lists
 * cannot drift apart.
 */
export const PWA_ROOT_ASSETS = [
  "sw.js",
  "manifest.webmanifest",
  ...PWA_ICONS.map(icon => icon.fileName),
];
