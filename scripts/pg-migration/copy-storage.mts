// Copies every stored object from a backup directory into the S3-compatible
// bucket configured by OBJECT_STORAGE_*, then verifies each one by reading it
// back and comparing SHA-256.
//
// Keys are written byte-for-byte as they appear in the database: photoUrl and
// storageKey hold the literal object key, so any rewriting orphans the file.
//
//   OBJECT_STORAGE_ENDPOINT=... OBJECT_STORAGE_BUCKET=... \
//   OBJECT_STORAGE_ACCESS_KEY_ID=... OBJECT_STORAGE_SECRET_ACCESS_KEY=... \
//   npx tsx scripts/pg-migration/copy-storage.mts <backup-dir>

import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type ManifestEntry = { key: string; bytes: number; sha256: string; contentType: string | null };

async function main() {
  const backupDir = process.argv[2];
  if (!backupDir) throw new Error("usage: copy-storage.mts <backup-dir>");

  const required = ["OBJECT_STORAGE_ENDPOINT", "OBJECT_STORAGE_REGION", "OBJECT_STORAGE_BUCKET",
    "OBJECT_STORAGE_ACCESS_KEY_ID", "OBJECT_STORAGE_SECRET_ACCESS_KEY"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`missing env: ${missing.join(", ")}`);
  if (process.env.OBJECT_STORAGE_KMS_KEY_ID) {
    throw new Error("OBJECT_STORAGE_KMS_KEY_ID must be unset: Supabase Storage does not implement SSE-KMS");
  }

  const bucket = process.env.OBJECT_STORAGE_BUCKET!;
  const client = new S3Client({
    region: process.env.OBJECT_STORAGE_REGION!,
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT!,
    // Supabase's S3 protocol requires path-style addressing.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY!,
    },
  });

  const manifest = JSON.parse(
    readFileSync(path.join(backupDir, "images", "MANIFEST.json"), "utf8"),
  ) as ManifestEntry[];
  console.log(`uploading ${manifest.length} objects to ${bucket}`);

  let failures = 0;
  for (const entry of manifest) {
    const local = readFileSync(path.join(backupDir, "images", entry.key));
    const localDigest = createHash("sha256").update(local).digest("hex");
    if (localDigest !== entry.sha256) {
      console.log(`  FAIL ${entry.key}: local file does not match its manifest checksum`);
      failures++;
      continue;
    }

    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: entry.key,
      Body: local,
      ContentType: entry.contentType ?? "application/octet-stream",
    }));

    // Read back rather than trusting ETag: it differs across providers.
    const readBack = await client.send(new GetObjectCommand({ Bucket: bucket, Key: entry.key }));
    const bytes = Buffer.from(await readBack.Body!.transformToByteArray());
    const remoteDigest = createHash("sha256").update(bytes).digest("hex");
    if (remoteDigest !== entry.sha256) {
      console.log(`  FAIL ${entry.key}: uploaded bytes differ`);
      failures++;
      continue;
    }
    console.log(`  ok ${entry.key} (${bytes.length} bytes)`);
  }

  console.log(failures === 0
    ? `\nSTORAGE VERIFIED: ${manifest.length} objects`
    : `\nSTORAGE FAILED: ${failures} of ${manifest.length}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
