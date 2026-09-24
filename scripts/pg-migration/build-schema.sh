#!/usr/bin/env bash
# Rebuilds the Postgres schema artefacts from drizzle/schema.ts.
# Deterministic and safe to re-run: the migrations directory is regenerated
# from scratch each time, so nothing is ever hand-edited downstream.
set -euo pipefail
cd "$(dirname "$0")/../.."

rm -rf drizzle/pg/migrations

echo "== porting schema =="
npx tsx scripts/pg-migration/codemod.mts

echo
echo "== typechecking =="
npx tsc --noEmit --skipLibCheck drizzle/schema.ts
echo "ok"

echo
echo "== generating DDL =="
npx drizzle-kit generate --config=drizzle.pg.config.ts --name=lfms_baseline

echo
echo "== fixing statement order =="
# drizzle-kit emits foreign keys before the unique indexes 78 composite FKs
# depend on; without this the baseline fails on the first composite FK.
npx tsx scripts/pg-migration/fix-ddl-order.mts drizzle/pg/migrations/0000_lfms_baseline.sql

echo
echo "== generating updatedAt triggers =="
npx tsx scripts/pg-migration/gen-updated-at-triggers.mts
