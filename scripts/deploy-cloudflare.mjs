import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";
import { parse as parseJsonc } from "jsonc-parser";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Unable to verify release provenance with ${command}`);
  }
  return result.stdout.trim();
}

if (target !== "production" && target !== "staging") {
  throw new Error("Deployment target must be production or staging");
}
if (
  target === "production" &&
  process.env.CLOUDFLARE_PRODUCTION_CONFIRM !== "l-fms.com"
) {
  throw new Error(
    "Set CLOUDFLARE_PRODUCTION_CONFIRM=l-fms.com for a production deploy"
  );
}

const releaseCommit = capture("git", ["rev-parse", "HEAD"]);
if (target === "production") {
  if (capture("git", ["status", "--porcelain"])) {
    throw new Error("Production deployment requires a clean Git worktree");
  }
  if (process.env.CLOUDFLARE_RELEASE_SHA !== releaseCommit) {
    throw new Error(
      "CLOUDFLARE_RELEASE_SHA must equal the reviewed commit at HEAD"
    );
  }
}

const suppliedPath = process.env.CLOUDFLARE_SECRETS_FILE;
if (!suppliedPath) {
  throw new Error(
    "CLOUDFLARE_SECRETS_FILE must point to a protected secret-manager file"
  );
}
const secretsPath = realpathSync(path.resolve(suppliedPath));
const relativeToRepository = path.relative(root, secretsPath);
if (
  relativeToRepository === "" ||
  (!relativeToRepository.startsWith("..") &&
    !path.isAbsolute(relativeToRepository))
) {
  throw new Error("The Cloudflare secrets file must be outside the repository");
}
if (
  process.platform !== "win32" &&
  (statSync(secretsPath).mode & 0o077) !== 0
) {
  throw new Error(
    "The Cloudflare secrets file must have mode 0600 or stricter"
  );
}

const config = parseJsonc(
  readFileSync(path.join(root, "wrangler.jsonc"), "utf8")
);
const required =
  target === "staging"
    ? config?.env?.staging?.secrets?.required
    : config?.secrets?.required;
if (!Array.isArray(required) || required.length === 0) {
  throw new Error(`Missing ${target} secrets.required contract`);
}

const secretSource = readFileSync(secretsPath, "utf8");
let parsedDeployEnvFile;
try {
  parsedDeployEnvFile = secretsPath.endsWith(".json")
    ? JSON.parse(secretSource)
    : parseDotenv(secretSource);
} catch {
  throw new Error("Unable to parse the Cloudflare secrets file");
}
const missing = required.filter(
  name =>
    typeof parsedDeployEnvFile?.[name] !== "string" ||
    parsedDeployEnvFile[name].length === 0
);
if (missing.length > 0) {
  throw new Error(`Secrets file is missing: ${missing.join(", ")}`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runPnpm(args) {
  const pnpmCli = process.env.npm_execpath;
  if (pnpmCli && pnpmCli.toLowerCase().includes("pnpm")) {
    run(process.execPath, [pnpmCli, ...args]);
    return;
  }
  run("pnpm", args);
}

runPnpm(["run", "check:secrets"]);
runPnpm(["run", "check"]);
runPnpm(["run", "build"]);
run(path.join(root, "node_modules", ".bin", "wrangler"), [
  "deploy",
  "--env",
  target === "staging" ? "staging" : "",
  "--secrets-file",
  secretsPath,
  "--containers-rollout",
  "gradual",
  "--strict",
]);
