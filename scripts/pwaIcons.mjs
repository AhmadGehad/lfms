/**
 * Generates the PWA icon PNGs at build time.
 *
 * Why generated rather than committed static files: the production Vite build
 * sets `publicDir: false` (client/public holds dev-only Manus tooling that must
 * never ship), so anything dropped in client/public is absent from dist. Icons
 * therefore have to be emitted by the build itself. Encoding them here keeps a
 * single source of truth for dev and prod and avoids an image dependency —
 * `sharp` is only present transitively and is not resolvable from this package.
 *
 * The artwork is the shield from the favicon in client/index.html, redrawn as a
 * filled silhouette so it can be rasterised analytically.
 */
import { deflateSync } from "node:zlib";

const DESIGN = 32; // design-space units, matching the favicon's viewBox
const BACKGROUND = [0x18, 0x26, 0x19]; // brand green, matches the login split-panel
const GLYPH = [0xf7, 0xf5, 0xee]; // warm off-white
const SAMPLES = 4; // per axis, so 16 samples per pixel

// ─── PNG encoding ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/** Encodes 8-bit RGBA pixel data as a PNG. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: truecolour with alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline, then the row's raw bytes.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── Shape tests, in 32-unit design space ────────────────────────────────────

/** Rounded square covering the full canvas; `radius` of 0 gives a plain square. */
function insideBackground(x, y, radius) {
  if (x < 0 || x > DESIGN || y < 0 || y > DESIGN) return false;
  if (radius <= 0) return true;
  const cx = Math.min(Math.max(x, radius), DESIGN - radius);
  const cy = Math.min(Math.max(y, radius), DESIGN - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Shield silhouette: a peaked top (matching the favicon's `l8 4` diagonals),
 * straight shoulders, then a parabolic taper to a point at the bottom.
 */
function insideShield(x, y) {
  if (y < 6 || y > 27) return false;
  let half;
  if (y <= 10) half = 2 * (y - 6);
  else if (y <= 16) half = 8;
  else {
    const t = (y - 16) / 11;
    half = 8 * (1 - t * t);
  }
  return Math.abs(x - 16) <= half;
}

// ─── Rasteriser ──────────────────────────────────────────────────────────────

/**
 * @param {number} size pixel dimensions of the square output
 * @param {{ cornerRadius?: number, glyphScale?: number }} options
 *   `cornerRadius` is a fraction of `size` (0 for full-bleed maskable icons).
 *   `glyphScale` shrinks the shield toward the centre so maskable icons keep
 *   their artwork inside the safe zone that launchers may crop to.
 */
export function renderIcon(size, options = {}) {
  const cornerRadius = (options.cornerRadius ?? 0.22) * DESIGN;
  const glyphScale = options.glyphScale ?? 1;
  const glyphCenterY = 16.5; // the shield spans 6..27, so its centre is not 16
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / (SAMPLES + 1);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let backgroundHits = 0;
      let glyphHits = 0;

      for (let sy = 1; sy <= SAMPLES; sy += 1) {
        for (let sx = 1; sx <= SAMPLES; sx += 1) {
          const x = ((px + sx * step) / size) * DESIGN;
          const y = ((py + sy * step) / size) * DESIGN;
          if (insideBackground(x, y, cornerRadius)) backgroundHits += 1;
          const gx = 16 + (x - 16) / glyphScale;
          const gy = glyphCenterY + (y - glyphCenterY) / glyphScale;
          if (insideShield(gx, gy)) glyphHits += 1;
        }
      }

      const total = SAMPLES * SAMPLES;
      const alpha = backgroundHits / total;
      // The glyph only shows where the background does, so a rounded corner
      // never leaves a floating sliver of shield outside the tile.
      const glyph = Math.min(glyphHits / total, alpha);
      const offset = (py * size + px) * 4;

      if (alpha === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        // Composite glyph over background, then premultiply nothing — PNG is
        // straight alpha, so only the coverage goes in the alpha channel.
        const mixed =
          (BACKGROUND[channel] * (alpha - glyph) + GLYPH[channel] * glyph) / alpha;
        rgba[offset + channel] = Math.round(mixed);
      }
      rgba[offset + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, size, rgba);
}

/** The icon set referenced by the web app manifest and index.html. */
export const PWA_ICONS = [
  { fileName: "pwa-192.png", size: 192, options: {} },
  { fileName: "pwa-512.png", size: 512, options: {} },
  {
    fileName: "pwa-maskable-512.png",
    size: 512,
    options: { cornerRadius: 0, glyphScale: 0.72 },
  },
  {
    fileName: "apple-touch-icon-180.png",
    size: 180,
    options: { cornerRadius: 0, glyphScale: 0.78 },
  },
];

export function buildPwaIcons() {
  return PWA_ICONS.map(icon => ({
    fileName: icon.fileName,
    contents: renderIcon(icon.size, icon.options),
  }));
}
