import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tenantDirectory = path.join(root, "dist", "public");
const adminDirectory = path.join(root, "dist", "admin");
const outputDirectory = path.join(root, "dist", "cloudflare-assets");

async function assertRegularFile(filePath) {
  const file = await lstat(filePath);
  if (!file.isFile() || file.isSymbolicLink() || file.size === 0) {
    throw new Error(`Expected a non-empty regular file: ${filePath}`);
  }
}

async function copyAssetTree(sourceDirectory, destinationDirectory) {
  const source = await lstat(sourceDirectory);
  if (!source.isDirectory() || source.isSymbolicLink()) {
    throw new Error(`Expected an asset directory: ${sourceDirectory}`);
  }

  await mkdir(destinationDirectory, { recursive: true });
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const destinationPath = path.join(destinationDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Asset symlinks are not allowed: ${sourcePath}`);
    }
    if (entry.isDirectory()) {
      await copyAssetTree(sourcePath, destinationPath);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported asset entry: ${sourcePath}`);
    }

    try {
      const [existing, incoming] = await Promise.all([
        readFile(destinationPath),
        readFile(sourcePath),
      ]);
      if (!existing.equals(incoming)) {
        throw new Error(`Conflicting generated asset: ${entry.name}`);
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        await copyFile(sourcePath, destinationPath);
        continue;
      }
      throw error;
    }
  }
}

function referencedAssets(html) {
  return [
    ...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)(?:[?#][^"]*)?"/g),
  ].map(match => match[1]);
}

async function assertHtmlAssetReferences(htmlPath, html) {
  const references = referencedAssets(html);
  if (references.length === 0) {
    throw new Error(
      `Generated HTML has no versioned asset references: ${htmlPath}`
    );
  }
  for (const reference of new Set(references)) {
    const relativePath = reference.slice(1);
    if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
      throw new Error(`Unsafe generated asset reference: ${reference}`);
    }
    await assertRegularFile(path.join(outputDirectory, relativePath));
  }
}

const tenantHtmlPath = path.join(tenantDirectory, "index.html");
const adminHtmlPath = path.join(adminDirectory, "index.html");
await Promise.all([
  assertRegularFile(tenantHtmlPath),
  assertRegularFile(adminHtmlPath),
]);

const [tenantHtml, adminHtml] = await Promise.all([
  readFile(tenantHtmlPath, "utf8"),
  readFile(adminHtmlPath, "utf8"),
]);
if (!tenantHtml.includes('src="/runtime-config.js"')) {
  throw new Error(
    "Tenant HTML must load the server-owned runtime configuration"
  );
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  copyFile(tenantHtmlPath, path.join(outputDirectory, "tenant.html")),
  copyFile(adminHtmlPath, path.join(outputDirectory, "admin.html")),
]);
await copyAssetTree(
  path.join(tenantDirectory, "assets"),
  path.join(outputDirectory, "assets")
);
await copyAssetTree(
  path.join(adminDirectory, "assets"),
  path.join(outputDirectory, "assets")
);
await Promise.all([
  assertHtmlAssetReferences(tenantHtmlPath, tenantHtml),
  assertHtmlAssetReferences(adminHtmlPath, adminHtml),
]);
