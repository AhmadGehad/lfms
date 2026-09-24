// Exercises the behaviours the MySQL->Postgres port can break silently. The
// 619 unit tests all run against server/testing/fakeDb.ts, so none of them
// would notice any of these regressions.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { createTestDb, hasTestDatabase } from "./setup";
import {
  authenticationTokens,
  companies,
  systemSettings,
  users,
} from "../../drizzle/schema";
import { isDuplicateEntryError } from "../_core/databaseErrors";
import { assertVersionedUpdate, VersionConflictError } from "../concurrency/versioning";

const suite = hasTestDatabase ? describe : describe.skip;

suite("postgres port", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];
  let pool: pg.Pool;

  beforeAll(async () => {
    ({ db, pool } = await createTestDb());
  });
  afterAll(async () => {
    await pool?.end();
  });

  const newUser = (over: Partial<typeof users.$inferInsert> = {}) => ({
    publicId: randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase(),
    openId: randomUUID(),
    name: "Test",
    ...over,
  });

  describe("result shape", () => {
    it("returns insertId from a single insert", async () => {
      const [result] = await db.insert(users).values(newUser());
      expect(result.insertId).toBeGreaterThan(0);
      expect(result.affectedRows).toBe(1);
    });

    it("reports affectedRows for bulk inserts and returns the first id", async () => {
      const [result] = await db.insert(users).values([newUser(), newUser(), newUser()]);
      expect(result.affectedRows).toBe(3);
      expect(result.insertId).toBeGreaterThan(0);
    });

    it("reports affectedRows for updates and deletes", async () => {
      const [inserted] = await db.insert(users).values(newUser({ name: "before" }));
      const [updated] = await db.update(users)
        .set({ name: "after" })
        .where(eq(users.id, inserted.insertId));
      expect(updated.affectedRows).toBe(1);

      const [deleted] = await db.delete(users).where(eq(users.id, inserted.insertId));
      expect(deleted.affectedRows).toBe(1);
    });

    it("reports zero affected rows when nothing matches", async () => {
      const [result] = await db.update(users).set({ name: "x" }).where(eq(users.id, -1));
      expect(result.affectedRows).toBe(0);
    });

    it("passes .returning() through untouched", async () => {
      const rows = await db.insert(users).values(newUser({ name: "returned" }))
        .returning({ id: users.id, name: users.name });
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("returned");
    });

    it("returns a [rows, fields] tuple from execute", async () => {
      const [rows] = await db.execute(sql`SELECT 1 AS one`);
      expect(rows[0]).toMatchObject({ one: 1 });
    });
  });

  describe("optimistic locking", () => {
    // The failure the runbook calls trap 2: if affectedRows reads as undefined
    // it coerces to 0 and every versioned write throws a spurious conflict.
    it("lets a matching version win and makes a stale version conflict", async () => {
      const [inserted] = await db.insert(users).values(newUser());
      const id = inserted.insertId;

      const [won] = await db.update(users)
        .set({ name: "v2", version: 2 })
        .where(and(eq(users.id, id), eq(users.version, 1)));
      expect(() => assertVersionedUpdate(won.affectedRows)).not.toThrow();

      const [lost] = await db.update(users)
        .set({ name: "v3", version: 3 })
        .where(and(eq(users.id, id), eq(users.version, 1)));
      expect(() => assertVersionedUpdate(lost.affectedRows)).toThrow(VersionConflictError);
    });
  });

  describe("duplicate key detection", () => {
    it("recognises a real Postgres 23505", async () => {
      const user = newUser();
      await db.insert(users).values(user);
      const error = await db.insert(users).values(user).catch((e: unknown) => e);
      expect(isDuplicateEntryError(error)).toBe(true);
    });
  });

  describe("upserts", () => {
    it("inserts then updates through an explicit conflict target", async () => {
      const [company] = await db.insert(companies).values({
        publicId: randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase(),
        name: "Acme",
        slug: `acme-${randomUUID().slice(0, 8)}`,
      });
      const row = {
        companyId: company.insertId,
        publicId: randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase(),
        settingKey: "theme",
        settingValue: "dark",
      };
      await db.insert(systemSettings).values(row);
      await db.insert(systemSettings).values({ ...row, settingValue: "light" })
        .onConflictDoUpdate({
          target: [systemSettings.companyId, systemSettings.settingKey],
          set: { settingValue: "light" },
        });

      const stored = await db.select().from(systemSettings)
        .where(eq(systemSettings.companyId, company.insertId));
      expect(stored).toHaveLength(1);
      expect(stored[0].settingValue).toBe("light");
    });
  });

  describe("updatedAt triggers", () => {
    // MySQL's ON UPDATE CURRENT_TIMESTAMP has no column-level Postgres
    // equivalent; without the generated triggers updatedAt silently freezes.
    it("advances updatedAt when the row actually changes", async () => {
      const [inserted] = await db.insert(users).values(newUser({ name: "first" }));
      const before = await readUpdatedAt(inserted.insertId);
      await new Promise(resolve => setTimeout(resolve, 1100));
      await db.update(users).set({ name: "second" }).where(eq(users.id, inserted.insertId));
      expect((await readUpdatedAt(inserted.insertId)).getTime())
        .toBeGreaterThan(before.getTime());
    });

    it("leaves updatedAt alone when the update changes nothing", async () => {
      const [inserted] = await db.insert(users).values(newUser({ name: "same" }));
      const before = await readUpdatedAt(inserted.insertId);
      await new Promise(resolve => setTimeout(resolve, 1100));
      await db.update(users).set({ name: "same" }).where(eq(users.id, inserted.insertId));
      expect((await readUpdatedAt(inserted.insertId)).getTime()).toBe(before.getTime());
    });

    it("respects an explicitly supplied updatedAt", async () => {
      const [inserted] = await db.insert(users).values(newUser());
      const explicit = new Date("2020-01-02T03:04:05.000Z");
      await db.update(users).set({ name: "explicit", updatedAt: explicit })
        .where(eq(users.id, inserted.insertId));
      expect((await readUpdatedAt(inserted.insertId)).toISOString())
        .toBe(explicit.toISOString());
    });

    async function readUpdatedAt(id: number) {
      const [row] = await db.select({ updatedAt: users.updatedAt })
        .from(users).where(eq(users.id, id));
      return row.updatedAt as Date;
    }
  });

  describe("bytea columns", () => {
    // 32-byte SHA-256 digests back auth tokens. Any text coercion here makes
    // every token silently stop matching.
    it("round-trips a 32-byte digest unchanged", async () => {
      const digest = createHash("sha256").update(randomUUID()).digest();
      const [user] = await db.insert(users).values(newUser());
      await db.insert(authenticationTokens).values({
        publicId: randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase(),
        userId: user.insertId,
        tokenHash: digest,
        purpose: "reset_password",
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const [found] = await db.select().from(authenticationTokens)
        .where(eq(authenticationTokens.tokenHash, digest));
      expect(found).toBeDefined();
      expect(Buffer.isBuffer(found.tokenHash)).toBe(true);
      expect((found.tokenHash as Buffer).equals(digest)).toBe(true);
    });
  });

  describe("generated columns", () => {
    it("enforces uniqueness only among live rows", async () => {
      const slug = `dup-${randomUUID().slice(0, 8)}`;
      const base = () => ({
        publicId: randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase(),
        name: "Dup",
        slug: `${slug}-${randomUUID().slice(0, 4)}`,
      });
      const [first] = await db.insert(companies).values(base());
      // Soft-delete clears the generated guard column, freeing the name.
      await db.update(companies).set({ deletedAt: new Date() })
        .where(eq(companies.id, first.insertId));
      await expect(db.insert(companies).values(base())).resolves.toBeDefined();
    });
  });

  describe("ported raw SQL", () => {
    it("runs the rewritten JSON, string_agg and date arithmetic fragments", async () => {
      const [jsonRows] = await db.execute(
        sql`SELECT ('{"k":"v"}'::json->>'k') AS extracted`,
      );
      expect(jsonRows[0]).toMatchObject({ extracted: "v" });

      const [aggRows] = await db.execute(
        sql`SELECT string_agg(c::text, ',' ORDER BY c) AS joined FROM (VALUES ('b'),('a')) t(c)`,
      );
      expect(aggRows[0]).toMatchObject({ joined: "a,b" });

      const [dateRows] = await db.execute(
        sql`SELECT (DATE '2026-01-10' - DATE '2026-01-01') AS days`,
      );
      expect(dateRows[0]).toMatchObject({ days: 9 });
    });
  });
});
