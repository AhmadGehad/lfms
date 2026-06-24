import { anyPermissionProcedure, permissionProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getClientIp } from "../_core/audit";
import {
  getVaccinationRecords, addVaccinationRecord, updateVaccinationRecord, deleteVaccinationRecord,
  getUpcomingVaccinations, getVaccinationCompliance, getVaccinationStatus,
  createAuditEntry, getAnimalById, getDb, captureChangedOldValues,
} from "../db";
import { createNotification } from "../db";
import { notifyOwner } from "../_core/notification";
import { animals } from "../../drizzle/schema";
import { eq, isNull, inArray, and } from "drizzle-orm";

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
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await addVaccinationRecord(input);
      const animal = await getAnimalById(input.animalId);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });

      // Create notification for vaccination record added
      const animalId = animal?.animal?.animalId || `Animal #${input.animalId}`;
      await createNotification({
        userId: ctx.user.id,
        alertType: "vaccination_recorded",
        title: "Vaccination Record Added",
        message: `Vaccination record added for ${animalId}`,
        relatedEntityType: "vaccinationRecord",
        relatedEntityId: String((result as any).insertId),
        priority: "medium",
      });

      // Notify owner
      await notifyOwner({
        title: "Vaccination Record Added",
        content: `A vaccination record has been added for ${animalId}. Batch: ${input.batchNumber || 'N/A'}, Date: ${input.vaccinationDate}`,
      });

      return result;
    }),

  updateVaccinationRecord: permissionProcedure("vaccinations", "update")
    .input(z.object({
      id: z.number(),
      vaccinationDate: z.string().optional(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
      isCompleted: z.boolean().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const oldValues = await captureChangedOldValues("vaccinationRecord", id, data);
      await updateVaccinationRecord(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String(id), action: "update", oldValues: oldValues as any, newValues: data, ipAddress: getClientIp(ctx) });
      return { id };
    }),

  deleteVaccinationRecord: permissionProcedure("vaccinations", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteVaccinationRecord(input.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String(input.id), action: "delete", ipAddress: getClientIp(ctx) });
      return { id: input.id };
    }),

  // ─── BULK OPERATIONS ───────────────────────────────────────────────────────────
  bulkApplyToAnimals: permissionProcedure("vaccinations", "create")
    .input(z.object({
      animalIds: z.array(z.number()).min(1),
      vaccineId: z.number(),
      vaccinationDate: z.string(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const results = [];
      for (const animalId of input.animalIds) {
        const result = await addVaccinationRecord({
          animalId,
          vaccineId: input.vaccineId,
          vaccinationDate: input.vaccinationDate,
          batchNumber: input.batchNumber,
          notes: input.notes,
          veterinarian: input.veterinarian,
        });
        results.push(result);
        await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      }

      await notifyOwner({
        title: "Bulk Vaccination Applied",
        content: `Vaccination applied to ${input.animalIds.length} animal(s). Date: ${input.vaccinationDate}`,
      });

      return { count: results.length };
    }),

  bulkApplyToCategory: permissionProcedure("vaccinations", "create")
    .input(z.object({
      categoryId: z.number(),
      vaccineId: z.number(),
      vaccinationDate: z.string(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Get all active animals in this category
      const categoryAnimals = await db.select({ id: animals.id }).from(animals).where(
        and(eq(animals.categoryId, input.categoryId), isNull(animals.deletedAt), eq(animals.isActive, true))
      );

      const results = [];
      for (const animal of categoryAnimals) {
        const result = await addVaccinationRecord({
          animalId: animal.id,
          vaccineId: input.vaccineId,
          vaccinationDate: input.vaccinationDate,
          batchNumber: input.batchNumber,
          notes: input.notes,
          veterinarian: input.veterinarian,
        });
        results.push(result);
        await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      }

      await notifyOwner({
        title: "Bulk Vaccination Applied to Category",
        content: `Vaccination applied to ${results.length} animal(s) in category. Date: ${input.vaccinationDate}`,
      });

      return { count: results.length };
    }),

  bulkApplyToCategories: permissionProcedure("vaccinations", "create")
    .input(z.object({
      categoryIds: z.array(z.number()).min(1),
      vaccineId: z.number(),
      vaccinationDate: z.string(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Get all active animals in these categories
      const categoryAnimals = await db.select({ id: animals.id }).from(animals).where(
        and(inArray(animals.categoryId, input.categoryIds), isNull(animals.deletedAt), eq(animals.isActive, true))
      );

      const results = [];
      for (const animal of categoryAnimals) {
        const result = await addVaccinationRecord({
          animalId: animal.id,
          vaccineId: input.vaccineId,
          vaccinationDate: input.vaccinationDate,
          batchNumber: input.batchNumber,
          notes: input.notes,
          veterinarian: input.veterinarian,
        });
        results.push(result);
        await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      }

      await notifyOwner({
        title: "Bulk Vaccination Applied to Categories",
        content: `Vaccination applied to ${results.length} animal(s) across ${input.categoryIds.length} categories. Date: ${input.vaccinationDate}`,
      });

      return { count: results.length };
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
