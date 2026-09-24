# LFMS → Supabase Migration Runbook

Moves LFMS from **TiDB Cloud (MySQL)** + Manus Forge storage to
**Supabase (Postgres 17)** + Supabase Storage.

Every step below is a script in `scripts/pg-migration/`, exposed as a `pnpm`
script. They are all re-runnable and verify their own work.

---

## Target project

| Item | Value |
| --- | --- |
| Project name | `lfms-production` |
| Project ref | `hwwskkndarysuwtzxovy` |
| DB host | `db.hwwskkndarysuwtzxovy.supabase.co` |
| Region | `eu-central-1` (Frankfurt) |
| Postgres | 17.6 |
| Org | CraftCX (free plan) |

> The org's other project, `craftcx` (`hyjljbvsgqkxncyzvuzc`), is unrelated and
> holds 19 live tables. **Never point migration tooling at it.** An earlier
> version of this runbook listed that host here by mistake.

Free tier allows 2 active projects and both slots are used, so
`lfms-production` is reset rather than replaced. It holds 58 leftover enum
types from an earlier test and no tables.

---

## Measured scale

| Fact | Value |
| --- | --- |
| Live tables | 104 (76 application + 27 legacy + `__drizzle_migrations`) |
| Rows | 3,372 |
| Size | 0.39 MB |
| Stored objects | 9 JPEGs, 1.9 MB, in Manus Forge |

The dataset is tiny, so the copy takes seconds and runs as a single
all-or-nothing transaction. The risk in this migration is entirely in code
correctness, not data volume.

---

## Layout

| Path | Role |
| --- | --- |
| `drizzle/schema.mysql.ts` | The frozen MySQL original. Port source; never edited by hand. |
| `drizzle/schema.ts` | Generated Postgres schema. All ~83 app imports point here. |
| `drizzle/pg/migrations/` | Generated baseline + the `updatedAt` triggers. |
| `drizzle/*.sql`, `drizzle/rollback/` | Legacy MySQL migrations, kept as an audit trail only. |
| `server/pgCompat.ts` | Makes Postgres mutations resolve to the mysql2 result tuple. |
| `scripts/pg-migration/` | Backup, schema build, copy, and verification tooling. |

`drizzle.config.ts` still throws by design, and `db:push` still refuses; those
guard the legacy MySQL database, which stays untouched.

---

## Deliberate divergences from `drizzle/schema.ts`

`schema.ts` declared constraints TiDB never enforced. Each divergence below was
an explicit decision to keep production data intact:

| Divergence | Reason |
| --- | --- |
| `animal_status_history_animal_fk` omitted | One status-history row references a hard-deleted animal. The row was kept. |
| `expenses_scope_check` omitted | 2 of 49 expenses are `scopeType='company'` with a `farmId` set. The rows were kept. |
| `saas_azal_audit_log.actorType` / `.actionCategory` nullable | 686 audit rows predate those columns. Matching production preserves them. |

All three are encoded in `scripts/pg-migration/codemod.mts`, so regenerating the
schema reapplies them.

---

## Procedure

### 1. Backup — immediately before cutover

```bash
pnpm pg:backup
```

Writes a timestamped snapshot **outside the repository** containing the DDL,
every row, per-table counts, a SHA-256 over the data, and every storage object
with per-file checksums. A backup from an earlier day is not a rollback for
data that changed since; take a fresh one.

### 2. Pre-flight

```bash
pnpm pg:preflight
```

Checks live data against every constraint the schema declares. Expected result
is the three known divergences above and nothing else. **Any new violation must
be resolved before continuing** — it would abort the load.

### 3. Build the schema

```bash
pnpm pg:build-schema
```

Ports `schema.mysql.ts` → `schema.ts`, typechecks it, generates the baseline
DDL, reorders the statements, and generates the 38 `updatedAt` triggers.

Two orderings matter and are handled automatically:
- Unique indexes must be created before the 78 composite foreign keys that
  depend on them; drizzle-kit emits them in the wrong order.
- `updatedAt` triggers compare rows with `to_jsonb`, because Postgres has no
  equality operator for `json` and a plain `NEW IS DISTINCT FROM OLD` raises
  42883 on every table with a json column.

### 4. Rehearse locally

```bash
createdb -p 5433 lfms_rehearsal
export PG_DATABASE_URL=postgres://postgres@127.0.0.1:5433/lfms_rehearsal
pnpm pg:apply-schema -- --reset && pnpm pg:copy && pnpm pg:copy-legacy && pnpm pg:verify
```

Rehearse until clean before touching Supabase.

### 5. Freeze writes, then load Supabase

Put the app in maintenance mode and stop all writes to TiDB. Re-run
`pnpm pg:backup`, then:

```bash
export PG_DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
pnpm pg:apply-schema -- --reset
pnpm pg:copy
pnpm pg:copy-legacy
pnpm pg:verify
```

Use the **session-mode pooler (port 5432)**, not `db.<ref>.supabase.co`: the
direct host is IPv6-only on the free tier, and session mode still supports the
sequence resets the copy performs.

`pg:verify` checks row counts, per-row content digests, byte-exact `bytea`,
numeric sums, generated-column recomputation, all 68 sequences, and all 154
foreign keys. It must print `VERIFICATION PASSED`.

### 6. Storage

Create a **private** bucket, take the S3 credentials from *Storage → S3
connection*, then:

```bash
export OBJECT_STORAGE_ENDPOINT='https://<ref>.storage.supabase.co/storage/v1/s3'
export OBJECT_STORAGE_REGION=eu-central-1
export OBJECT_STORAGE_BUCKET=<bucket>
export OBJECT_STORAGE_ACCESS_KEY_ID=... OBJECT_STORAGE_SECRET_ACCESS_KEY=...
pnpm pg:copy-storage <backup-dir>
```

Leave `OBJECT_STORAGE_KMS_KEY_ID` unset — Supabase does not implement SSE-KMS,
and the app now refuses to start if it is set alongside a custom endpoint.

### 7. Test against the migrated database

```bash
pnpm check && pnpm test
PG_TEST_DATABASE_URL=<a scratch database> pnpm test:integration
pnpm test:regression
```

The 619 unit tests all use `server/testing/fakeDb.ts` and prove nothing about
engine behaviour. `test:integration` is what actually covers the port: result
shapes, optimistic locking, SQLSTATE 23505, upsert conflict targets, the
`updatedAt` triggers, `bytea` round-trips and the rewritten raw SQL.

Then exercise the app by hand: login, animal create/edit, a soft delete, a
photo upload and display, and a capital contribution.

### 8. Cut over

```bash
wrangler secret put DATABASE_URL      # transaction pooler, port 6543, sslmode=require
wrangler secret put OBJECT_STORAGE_ENDPOINT   # and the other OBJECT_STORAGE_* values
pnpm check:cloudflare-secrets
```

Use the **transaction-mode pooler (6543)** for the app: Cloudflare containers
are short-lived and would exhaust direct connections. Deploy, leave maintenance
mode, and watch logs for `23505`, `25P02`, `VersionConflictError` spikes, and
`TypeError: ... is not iterable` — those four are the canaries for the riskiest
parts of this port.

---

## After cutover

1. **Rotate credentials**: `DATABASE_URL`, `JWT_SECRET`, `BUILT_IN_FORGE_API_KEY`,
   `VITE_FRONTEND_FORGE_API_KEY`.
2. **Leave TiDB and Forge storage running and untouched for at least a week.**
3. **Move off the free tier.** It pauses after 7 days idle, caps the database at
   500 MB, and has no automated backups.
4. RLS is off on all 76 tables; tenant isolation lives in `server/tenancy/*`, as
   it did under MySQL. Keep the service role key server-side only. If the
   Supabase Data API or anon key is ever exposed to browsers, RLS becomes
   mandatory.
