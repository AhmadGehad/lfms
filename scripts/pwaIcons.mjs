/**
 * The APIS icon set: favicon, Apple touch icon and web app manifest icons.
 *
 * Why emitted by the build rather than placed in client/public: the production
 * Vite build sets `publicDir: false` (client/public holds dev-only tooling that
 * must never ship), so anything dropped there is absent from dist. The vite
 * plugin emits these files to the dist root instead, from the brand files
 * supplied with the APIS guidelines, so dev and prod serve identical bytes.
 */
import { readFileSync } from "node:fs";

const ICON_DIRECTORY = new URL("../client/src/assets/brand/icons/", import.meta.url);

/** Root-level icon files referenced by client/index.html and the manifest. */
export const PWA_ICONS = [
  { fileName: "favicon.ico", source: "favicon.ico", contentType: "image/x-icon" },
  { fileName: "favicon.svg", source: "favicon.svg", contentType: "image/svg+xml" },
  { fileName: "apple-touch-icon-180.png", source: "apple-touch-icon.png", contentType: "image/png", size: 180 },
  { fileName: "pwa-192.png", source: "apis-icon-192.png", contentType: "image/png", size: 192 },
  { fileName: "pwa-512.png", source: "apis-icon-512.png", contentType: "image/png", size: 512 },
  // The brand icon is full-bleed with the seal well inside the 80% safe zone
  // launchers crop to, so the same artwork doubles as the maskable icon.
  { fileName: "pwa-maskable-512.png", source: "apis-icon-512.png", contentType: "image/png", size: 512 },
];

export function buildPwaIcons() {
  return PWA_ICONS.map(icon => ({
    fileName: icon.fileName,
    contentType: icon.contentType,
    contents: readFileSync(new URL(icon.source, ICON_DIRECTORY)),
  }));
}
