import { protectedProcedure, staffProcedure, supervisorProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getClientIp } from "../_core/audit";
import {
  getVaccinationRecords, addVaccinationRecord, updateVaccinationRecord, deleteVaccinationRecord,
  getUpcomingVaccinations, getVaccinationCompliance, getVaccinationStatus,
  createAuditEntry, getAnimalById,
} from "../db";
import { createNotification } from "../db";
import { notifyOwner } from "../_core/notification";

export const vaccinationRouter = router({
  // ─── VACCINATION RECORDS ───────────────────────────────────────────────────────
  getVaccinationRecords: protectedProcedure
    .input(z.object({ animalId: z.number().optional() }).optional())
    .query(({ input }) => getVaccinationRecords(input?.animalId)),

  addVaccinationRecord: staffProcedure
    .input(z.object({
      animalId: z.number(),
      vaccineId: z.number(),
      vaccinationDate: z.string(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
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

  updateVaccinationRecord: staffProcedure
    .input(z.object({
      id: z.number(),
      vaccinationDate: z.string().optional(),
      batchNumber: z.string().optional(),
      notes: z.string().optional(),
      veterinarian: z.string().optional(),
      isCompleted: z.boolean().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      await updateVaccinationRecord(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return { id };
    }),

  deleteVaccinationRecord: supervisorProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteVaccinationRecord(input.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccinationRecord", entityId: String(input.id), action: "delete", ipAddress: getClientIp(ctx) });
      return { id: input.id };
    }),

  // ─── DASHBOARD & REPORTS ───────────────────────────────────────────────────────
  getUpcomingVaccinations: protectedProcedure
    .input(z.object({ days: z.number().optional() }).optional())
    .query(({ input }) => getUpcomingVaccinations(input?.days)),

  getVaccinationCompliance: protectedProcedure.query(() => getVaccinationCompliance()),
});
