import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { ownerProcedure, permissionProcedure, router } from "../_core/trpc";
import { createAuditEntry, getDb } from "../db";
import {
  applyCanonicalData,
  canonicalDataToObject,
  readAllCanonicalTables,
  type ImportMode,
} from "../canonicalTransfer";
import { CANONICAL_TABLES, validateCanonicalDataObject } from "../excelDataContract";
import { users } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { eq } from "drizzle-orm";

const JSON_BACKUP_FORMAT = "lfms-canonical-json";
const JSON_BACKUP_VERSION = 3;
const importModeSchema = z.enum(["append", "replace"]).default("append");

type CompleteSnapshot = {
  format: typeof JSON_BACKUP_FORMAT;
  version: typeof JSON_BACKUP_VERSION;
  generatedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
};

function parseSnapshot(base64: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
  } catch {
    throw new Error("Invalid backup file: not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup file");
  const snapshot = parsed as Partial<CompleteSnapshot>;
  if (snapshot.format !== JSON_BACKUP_FORMAT || snapshot.version !== JSON_BACKUP_VERSION) {
    throw new Error(
      `Unsupported JSON backup format/version. Expected ${JSON_BACKUP_FORMAT} version ${JSON_BACKUP_VERSION}. Export a new complete backup before restoring.`,
    );
  }
  return {
    snapshot: snapshot as CompleteSnapshot,
    rowsByTable: validateCanonicalDataObject(snapshot.tables),
  };
}

export const backupRouter = router({
  download: permissionProcedure("data", "export").query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const generatedAt = new Date().toISOString();
    const rowsByTable = await db.transaction(tx => readAllCanonicalTables(tx));
    const tables = canonicalDataToObject(rowsByTable);
    const snapshot: CompleteSnapshot = {
      format: JSON_BACKUP_FORMAT,
      version: JSON_BACKUP_VERSION,
      generatedAt,
      tables,
    };

    return {
      filename: `lfms-complete-backup-${generatedAt.slice(0, 10)}.json`,
      mimeType: "application/json",
      base64: Buffer.from(JSON.stringify(snapshot, null, 2), "utf-8").toString("base64"),
      formatVersion: JSON_BACKUP_VERSION,
      stats: Object.fromEntries(CANONICAL_TABLES.map(spec => [spec.key, tables[spec.key]?.length ?? 0])),
    };
  }),

  restore: ownerProcedure
    .input(z.object({ base64: z.string(), mode: importModeSchema }))
    .mutation(async ({ input, ctx }) => {
      const { snapshot, rowsByTable } = parseSnapshot(input.base64);
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      let stats: Awaited<ReturnType<typeof applyCanonicalData>> = [];
      await db.transaction(async tx => {
        const [ownerBefore] = await tx
          .select()
          .from(users)
          .where(eq(users.openId, ENV.ownerOpenId))
          .limit(1);
        stats = await applyCanonicalData(tx, rowsByTable, input.mode as ImportMode);
        await tx.insert(users).values({
          openId: ENV.ownerOpenId,
          name: ownerBefore?.name ?? ctx.user.name,
          email: ownerBefore?.email ?? ctx.user.email,
          loginMethod: ownerBefore?.loginMethod ?? ctx.user.loginMethod,
          role: "owner",
          lastSignedIn: ownerBefore?.lastSignedIn ?? ctx.user.lastSignedIn,
        }).onDuplicateKeyUpdate({ set: { role: "owner" } });
        await createAuditEntry(
          {
            userId: ctx.user?.id,
            action: "restore",
            ipAddress: getClientIp(ctx),
            entityType: "backup",
            entityId: `${snapshot.generatedAt}-${input.mode}`,
            newValues: {
              formatVersion: JSON_BACKUP_VERSION,
              mode: input.mode,
              totalApplied: stats.reduce((sum, stat) => sum + stat.applied, 0),
              tables: stats,
            } as any,
          },
          tx,
        );
      });

      return {
        mode: input.mode,
        formatVersion: JSON_BACKUP_VERSION,
        totalApplied: stats.reduce((sum, stat) => sum + stat.applied, 0),
        stats: Object.fromEntries(
          stats.map(stat => [stat.table, { restored: stat.applied, skipped: stat.skipped }]),
        ),
      };
  }),
});
