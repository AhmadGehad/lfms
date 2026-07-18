import { anyPermissionProcedure, permissionProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getClientIp } from "../_core/audit";
import {
  getVaccinationRecords, addVaccinationRecord, updateVaccinationRecord, deleteVaccinationRecord,
  getUpcomingVaccinations, getVaccinationCompliance,
  createAuditEntry, getDb, captureChangedOldValues,
} from "../db";
import { createNotification } from "../db";
import { animals } from "../../drizzle/schema";
import { eq, isNull, inArray, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { tenantScope } from "../tenancy/scope";
import { executeIdempotent } from "../platform/idempotency";

function requireVersionedMutation(updated: boolean): void {
  if (!updated) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Vaccination record changed since it was loaded. Refresh and try again.",
    });
  }
}

export const vaccinationRouter = router({
  // ─── VACCINATION RECORDS ───────────────────────────────────────────────────────
  getVaccinationRecords: anyPermissionProcedure([
    ["vaccinations", "view"],
    ["animals", "view"],
  ])
    .input(z.object({ animalId: z.number().optional(), ownerId: z.number().optional() }).optional())
    .query(({ input }) => getVaccinationRecords(input?.animalId, input?.ownerId)),

  addVaccinationRecord: permissionProcedure("vaccinations", "create")
    .input(z.object({
      animalId: z.number(),
      vaccineId: z.number(),
      vaccinationDate: z.string(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
      notifyBeforeNext: z.number().int().min(0).max(365).optional(),
      notifyBeforeBooster: z.number().int().min(0).max(365).optional(),
      idempotencyKey: z.string().min(8).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { idempotencyKey, ...data } = input;
      return db.transaction(tx => executeIdempotent(tx, {
        companyId: ctx.tenant!.companyId,
        userId: ctx.user.id,
        key: idempotencyKey,
        operation: "vaccination.addVaccinationRecord",
        body: data,
      }, async () => {
        const result = await addVaccinationRecord(data, tx);
        const [animal] = await tx.select({ animalId: animals.animalId }).from(animals).where(and(
          tenantScope(ctx.tenant!, animals),
          eq(animals.id, data.animalId),
          isNull(animals.deletedAt),
        )).limit(1);
        const animalId = animal?.animalId || `Animal #${data.animalId}`;
        await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String((result as any).insertId), action: "create", newValues: data, ipAddress: getClientIp(ctx) }, tx);
        await createNotification({
          userId: ctx.user.id,
          alertType: "vaccination_recorded",
          title: "Vaccination Record Added",
          message: `Vaccination record added for ${animalId}`,
          relatedEntityType: "vaccinationRecord",
          relatedEntityId: String((result as any).insertId),
          priority: "medium",
        }, tx);
        return result;
      }));
    }),

  updateVaccinationRecord: permissionProcedure("vaccinations", "update")
    .input(z.object({
      id: z.number(),
      expectedVersion: z.number().int().positive(),
      vaccinationDate: z.string().optional(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
      isCompleted: z.boolean().optional(),
    }))
    .mutation(async ({ input: { id, expectedVersion, ...data }, ctx }) => {
      const oldValues = await captureChangedOldValues("vaccinationRecord", id, data);
      requireVersionedMutation(await updateVaccinationRecord(id, data, expectedVersion));
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String(id), action: "update", oldValues: oldValues as any, newValues: data, ipAddress: getClientIp(ctx) });
      return { id };
    }),

  deleteVaccinationRecord: permissionProcedure("vaccinations", "delete")
    .input(z.object({ id: z.number(), expectedVersion: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireVersionedMutation(await deleteVaccinationRecord(input.id, input.expectedVersion));
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String(input.id), action: "delete", ipAddress: getClientIp(ctx) });
      return { id: input.id };
    }),

  // ─── BULK OPERATIONS ───────────────────────────────────────────────────────────
  bulkApplyToAnimals: permissionProcedure("vaccinations", "create")
    .input(z.object({
      animalIds: z.array(z.number()).min(1).max(500).refine(ids => new Set(ids).size === ids.length, "Animal IDs must be unique"),
      vaccineId: z.number(),
      vaccinationDate: z.string(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
      idempotencyKey: z.string().min(8).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { idempotencyKey, ...data } = input;
      return db.transaction(tx => executeIdempotent(tx, {
        companyId: ctx.tenant!.companyId,
        userId: ctx.user.id,
        key: idempotencyKey,
        operation: "vaccination.bulkApplyToAnimals",
        body: data,
      }, async () => {
        const results = [];
        for (const animalId of data.animalIds) {
          const result = await addVaccinationRecord({
            animalId,
            vaccineId: data.vaccineId,
            vaccinationDate: data.vaccinationDate,
            batchNumber: data.batchNumber,
            notes: data.notes,
            veterinarian: data.veterinarian,
          }, tx);
          results.push(result);
          await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String((result as any).insertId), action: "create", newValues: data, ipAddress: getClientIp(ctx) }, tx);
        }
        await createNotification({
          userId: ctx.user.id,
          alertType: "vaccination_recorded",
          title: "Bulk Vaccination Applied",
          message: `Vaccination applied to ${data.animalIds.length} animal(s). Date: ${data.vaccinationDate}`,
          relatedEntityType: "vaccinationRecord",
          priority: "medium",
        }, tx);
        return { count: results.length };
      }));
    }),

  bulkApplyToCategory: permissionProcedure("vaccinations", "create")
    .input(z.object({
      categoryId: z.number(),
      vaccineId: z.number(),
      vaccinationDate: z.string(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
      idempotencyKey: z.string().min(8).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenant) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Company context required" });
      }
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const { idempotencyKey, ...data } = input;
      return db.transaction(tx => executeIdempotent(tx, {
        companyId: ctx.tenant!.companyId,
        userId: ctx.user.id,
        key: idempotencyKey,
        operation: "vaccination.bulkApplyToCategory",
        body: data,
      }, async () => {
        const categoryAnimals = await tx.select({ id: animals.id }).from(animals).where(
          and(
            tenantScope(ctx.tenant!, animals),
            eq(animals.categoryId, data.categoryId),
            isNull(animals.deletedAt),
            eq(animals.isActive, true),
          )
        );
        const results = [];
        for (const animal of categoryAnimals) {
          const result = await addVaccinationRecord({
            animalId: animal.id,
            vaccineId: data.vaccineId,
            vaccinationDate: data.vaccinationDate,
            batchNumber: data.batchNumber,
            notes: data.notes,
            veterinarian: data.veterinarian,
          }, tx);
          results.push(result);
          await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String((result as any).insertId), action: "create", newValues: data, ipAddress: getClientIp(ctx) }, tx);
        }
        await createNotification({
          userId: ctx.user.id,
          alertType: "vaccination_recorded",
          title: "Bulk Vaccination Applied to Category",
          message: `Vaccination applied to ${results.length} animal(s) in category. Date: ${data.vaccinationDate}`,
          relatedEntityType: "vaccinationRecord",
          priority: "medium",
        }, tx);
        return { count: results.length };
      }));
    }),

  bulkApplyToCategories: permissionProcedure("vaccinations", "create")
    .input(z.object({
      categoryIds: z.array(z.number()).min(1).max(100).refine(ids => new Set(ids).size === ids.length, "Category IDs must be unique"),
      vaccineId: z.number(),
      vaccinationDate: z.string(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
      idempotencyKey: z.string().min(8).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenant) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Company context required" });
      }
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const { idempotencyKey, ...data } = input;
      return db.transaction(tx => executeIdempotent(tx, {
        companyId: ctx.tenant!.companyId,
        userId: ctx.user.id,
        key: idempotencyKey,
        operation: "vaccination.bulkApplyToCategories",
        body: data,
      }, async () => {
        const categoryAnimals = await tx.select({ id: animals.id }).from(animals).where(
          and(
            tenantScope(ctx.tenant!, animals),
            inArray(animals.categoryId, data.categoryIds),
            isNull(animals.deletedAt),
            eq(animals.isActive, true),
          )
        );
        const results = [];
        for (const animal of categoryAnimals) {
          const result = await addVaccinationRecord({
            animalId: animal.id,
            vaccineId: data.vaccineId,
            vaccinationDate: data.vaccinationDate,
            batchNumber: data.batchNumber,
            notes: data.notes,
            veterinarian: data.veterinarian,
          }, tx);
          results.push(result);
          await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String((result as any).insertId), action: "create", newValues: data, ipAddress: getClientIp(ctx) }, tx);
        }
        await createNotification({
          userId: ctx.user.id,
          alertType: "vaccination_recorded",
          title: "Bulk Vaccination Applied to Categories",
          message: `Vaccination applied to ${results.length} animal(s) across ${data.categoryIds.length} categories. Date: ${data.vaccinationDate}`,
          relatedEntityType: "vaccinationRecord",
          priority: "medium",
        }, tx);
        return { count: results.length };
      }));
    }),

  // ─── DASHBOARD & REPORTS ───────────────────────────────────────────────────────
  getUpcomingVaccinations: anyPermissionProcedure([
    ["vaccinations", "view"],
    ["dashboard", "view"],
  ])
    .input(z.object({ days: z.number().optional() }).optional())
    .query(({ input }) => getUpcomingVaccinations(input?.days)),

  getVaccinationCompliance: permissionProcedure("vaccinations", "view").query(() => getVaccinationCompliance()),
});
