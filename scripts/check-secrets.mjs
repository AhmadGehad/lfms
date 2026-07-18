import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const patterns = [
  { name: "credentialed database URL", value: /mysql:\/\/[^\s:@/]+:[^\s@/]+@/gi },
  { name: "private key", value: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "JWT-like token", value: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,}\b/g },
  {
    name: "assigned secret",
    value: /^[ \t]*[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|SESSION_PEPPER)[A-Z0-9_]*[ \t]*=[ \t]*["']?(?!replace|local-|example|test-|\$\{|<)[A-Za-z0-9_+\-./=]{16,}/gim,
  },
];

const ignored = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "ENV_VARIABLES.md",
]);

const findings = [];
for (const file of files) {
  if (ignored.has(file)) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue;
  for (const pattern of patterns) {
    pattern.value.lastIndex = 0;
    let match;
    while ((match = pattern.value.exec(content))) {
      const line = content.slice(0, match.index).split("\n").length;
      findings.push(`${file}:${line}: possible ${pattern.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed:");
  for (const finding of findings) console.error(`  ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${files.length} tracked/untracked files).`);
}
