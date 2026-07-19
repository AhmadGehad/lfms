import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, printParseErrorCode } from "jsonc-parser";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "wrangler.jsonc");
const parseErrors = [];
const config = parse(readFileSync(configPath, "utf8"), parseErrors, {
  allowTrailingComma: true,
  disallowComments: false,
});

if (parseErrors.length > 0) {
  const errors = parseErrors
    .map(error => `${printParseErrorCode(error.error)} at ${error.offset}`)
    .join(", ");
  throw new Error(`Unable to parse wrangler.jsonc: ${errors}`);
}

const required = config?.secrets?.required;
if (
  !Array.isArray(required) ||
  required.length === 0 ||
  required.some(name => typeof name !== "string" || name.length === 0)
) {
  throw new Error("wrangler.jsonc must define non-empty secrets.required");
}

const executable = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "wrangler.cmd" : "wrangler",
);
const result = spawnSync(
  executable,
  ["secret", "list", "--format", "json"],
  {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

let listed;
try {
  listed = JSON.parse(result.stdout.trim());
} catch {
  throw new Error("Wrangler returned an invalid secret list");
}
if (!Array.isArray(listed)) {
  throw new Error("Wrangler returned an unexpected secret-list response");
}

const configured = new Set(
  listed
    .map(entry =>
      typeof entry === "string"
        ? entry
        : typeof entry?.name === "string"
          ? entry.name
          : null,
    )
    .filter(Boolean),
);
const missing = required.filter(name => !configured.has(name));
if (missing.length > 0) {
  console.error(`Missing Cloudflare Worker secrets: ${missing.join(", ")}`);
  console.error("Set each with: pnpm exec wrangler secret put <NAME>");
  process.exit(1);
}

console.log(`Cloudflare secret preflight passed (${required.length} required).`);
