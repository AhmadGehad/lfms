// The 9 animal photos predate saas_tenant_files, so no registry row exists for
// them. Both the /manus-storage proxy and storageGetSignedUrl require one, so
// the images have been unreachable in production (verified against the
// original MySQL stack - same 404s) even though the bytes were always there.
//
// This registers each key from a backup manifest, using the real size and
// SHA-256, so the photos resolve. Idempotent: existing keys are skipped.
//
//   PG_DATABASE_URL=... npx tsx scripts/pg-migration/register-legacy-photos.mts <backup-dir> [--apply]

import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { SUPABASE_ROOT_CA } from "../../server/_core/supabaseCa";

/**
 * TLS options for a Postgres URL. Supabase needs its private root pinned;
 * a local rehearsal database speaks plaintext and must not be handed an
 * `ssl` block at all.
 */
function pgTls(url: string) {
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return undefined;
  return { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true };
}
import { generatePublicId } from "../../server/tenancy/publicIds";

type ManifestEntry = { key: string; bytes: number; sha256: string; contentType: string | null };

async function main() {
  const backupDir = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!backupDir) throw new Error("usage: register-legacy-photos.mts <backup-dir> [--apply]");
  const url = process.env.PG_DATABASE_URL;
  if (!url) throw new Error("PG_DATABASE_URL is required");

  const manifest = JSON.parse(
    readFileSync(path.join(backupDir, "images", "MANIFEST.json"), "utf8"),
  ) as ManifestEntry[];
  const bySize = new Map(manifest.map((m) => [m.key, m]));

  const client = new pg.Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ""),
    ssl: pgTls(url),
  });
  await client.connect();

  // Attribute each file to the animal that references it, so companyId/farmId
  // match the row the proxy will check access against.
  const { rows: refs } = await client.query<{
    key: string; companyId: number; farmId: number | null; membershipId: number | null;
  }>(`
    SELECT DISTINCT ON (a."photoUrl")
           a."photoUrl" AS key,
           a."companyId",
           a."farmId",
           (SELECT m.id FROM saas_company_memberships m
             WHERE m."companyId" = a."companyId" AND m.status = 'active'
             ORDER BY m.id LIMIT 1) AS "membershipId"
    FROM saas_azal_animals a
    WHERE a."photoUrl" IS NOT NULL AND a."photoUrl" <> ''
    ORDER BY a."photoUrl", a.id`);

  const { rows: existing } = await client.query<{ storageKey: string }>(
    `SELECT "storageKey" FROM saas_tenant_files`);
  const already = new Set(existing.map((r) => r.storageKey));

  const planned: string[] = [];
  const skipped: string[] = [];
  for (const ref of refs) {
    const meta = bySize.get(ref.key);
    if (!meta) { skipped.push(`${ref.key}: not in backup manifest`); continue; }
    if (already.has(ref.key)) { skipped.push(`${ref.key}: already registered`); continue; }
    if (!ref.membershipId) { skipped.push(`${ref.key}: no active membership for company ${ref.companyId}`); continue; }
    planned.push(ref.key);

    if (apply) {
      await client.query(
        `INSERT INTO saas_tenant_files
           ("publicId","companyId","farmId","storageKey","originalName","contentType",
            "sizeBytes","checksumSha256","status","uploadedByMembershipId","version")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'clean',$9,1)`,
        [
          generatePublicId(),
          ref.companyId,
          ref.farmId,
          ref.key,
          path.basename(ref.key),
          meta.contentType ?? "image/jpeg",
          meta.bytes,
          meta.sha256,
          ref.membershipId,
        ],
      );
    }
  }

  console.log(apply ? "REGISTERED:" : "WOULD REGISTER (dry run, pass --apply):");
  for (const k of planned) console.log(`  ${k}`);
  if (skipped.length) {
    console.log("skipped:");
    for (const s of skipped) console.log(`  ${s}`);
  }
  const { rows: [count] } = await client.query(`SELECT count(*)::int n FROM saas_tenant_files`);
  console.log(`saas_tenant_files rows now: ${count.n}`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
