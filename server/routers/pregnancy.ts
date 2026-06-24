import { anyPermissionProcedure, permissionProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getClientIp } from "../_core/audit";
import {
  getPregnancies,
  getActivePregnancyByAnimal,
  getPregnancyRecordById,
  getReproductiveHistory,
  getPregnancySummary,
  getUpcomingPregnancyDueDates,
  getUpcomingPregnancyCheckups,
  createPregnancyRecord,
  updatePregnancyRecord,
  deletePregnancyRecord,
  createAuditEntry,
  createNotification,
  getAnimalById,
} from "../db";

const pregnancyStatus = z.enum(["active", "delivered", "aborted", "lost"]);

export const pregnancyRouter = router({
  // ─── LIST / READ ───────────────────────────────────────────────────────────
  list: anyPermissionProcedure([
    ["pregnancy", "view"],
    ["animals", "view"],
  ])
    .input(
      z.object({
        animalId: z.number().optional(),
        status: pregnancyStatus.optional(),
        ownerId: z.number().optional(),
        dueWithinDays: z.number().optional(),
      }).optional(),
    )
    .query(({ input }) => getPregnancies(input ?? {})),

  byAnimal: anyPermissionProcedure([
    ["pregnancy", "view"],
    ["animals", "view"],
  ])
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getPregnancies({ animalId: input.animalId })),

  activeByAnimal: anyPermissionProcedure([
    ["pregnancy", "view"],
    ["animals", "view"],
  ])
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getActivePregnancyByAnimal(input.animalId)),

  reproductiveHistory: anyPermissionProcedure([
    ["pregnancy", "view"],
    ["animals", "view"],
  ])
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getReproductiveHistory(input.animalId)),

  summary: permissionProcedure("pregnancy", "view")
    .input(z.object({ ownerId: z.number().optional() }).optional())
    .query(({ input }) => getPregnancySummary(input?.ownerId)),

  getUpcoming: anyPermissionProcedure([
    ["pregnancy", "view"],
    ["dashboard", "view"],
  ])
    .input(z.object({ days: z.number().optional() }).optional())
    .query(async ({ input }) => ({
      due: await getUpcomingPregnancyDueDates(input?.days ?? 30),
      checkups: await getUpcomingPregnancyCheckups(input?.days ?? 30),
    })),

  // ─── MUTATIONS ───────────────────────────────────────────────────────────────
  create: permissionProcedure("pregnancy", "create")
    .input(
      z.object({
        animalId: z.number(),
        confirmationDate: z.string(),
        sireId: z.number().nullable().optional(),
        notifyBeforeDue: z.number().int().min(0).max(365).optional(),
        checkupDate: z.string().nullable().optional(),
        notifyBeforeCheckup: z.number().int().min(0).max(365).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createPregnancyRecord({ ...input, createdBy: ctx.user.id });
      const id = String((result as any).insertId);
      const animal = await getAnimalById(input.animalId);
      const code = animal?.animal?.animalId ?? `Animal #${input.animalId}`;
      await createAuditEntry({
        userId: ctx.user.id,
        entityType: "pregnancyRecord",
        entityId: id,
        action: "create",
        newValues: input as any,
        ipAddress: getClientIp(ctx),
      });
      await createNotification({
        userId: ctx.user.id,
        alertType: "pregnancy_recorded",
        title: "Pregnancy Recorded",
        message: `Pregnancy recorded for ${code} (confirmed ${input.confirmationDate})`,
        relatedEntityType: "pregnancy_record",
        relatedEntityId: id,
        priority: "medium",
      });
      return result;
    }),

  update: permissionProcedure("pregnancy", "update")
    .input(
      z.object({
        id: z.number(),
        confirmationDate: z.string().optional(),
        sireId: z.number().nullable().optional(),
        notifyBeforeDue: z.number().int().min(0).max(365).optional(),
        checkupDate: z.string().nullable().optional(),
        notifyBeforeCheckup: z.number().int().min(0).max(365).optional(),
        status: pregnancyStatus.optional(),
        completedDate: z.string().nullable().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const before = await getPregnancyRecordById(id);
      await updatePregnancyRecord(id, data);
      await createAuditEntry({
        userId: ctx.user.id,
        entityType: "pregnancyRecord",
        entityId: String(id),
        action: "update",
        // Prior values of the changed fields, so the action can be reverted.
        oldValues: before ? Object.fromEntries(Object.keys(data).map((k) => [k, (before as any)[k]])) as any : undefined,
        newValues: data as any,
        ipAddress: getClientIp(ctx),
      });
      return { id };
    }),

  delete: permissionProcedure("pregnancy", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deletePregnancyRecord(input.id, ctx.user.id);
      await createAuditEntry({
        userId: ctx.user.id,
        entityType: "pregnancyRecord",
        entityId: String(input.id),
        action: "delete",
        ipAddress: getClientIp(ctx),
      });
      return { id: input.id };
    }),
});
