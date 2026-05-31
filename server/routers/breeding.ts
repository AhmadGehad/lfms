import { z } from "zod";
import { protectedProcedure, staffProcedure, router } from "../_core/trpc";
import {
  createLambingRecord,
  createAnimal,
  createAuditEntry,
  getAllCategories,
  getAllStatuses,
  getAllGroups,
  getLambingLog,
  updateLambingRecord,
  incrementCategorySequence,
  recordStatusChange,
} from "../db";

export const breedingRouter = router({
  // ─── LIST LAMBING RECORDS ───────────────────────────────────────────────────
  listLambing: protectedProcedure
    .input(z.object({ isPromoted: z.boolean().optional() }).optional())
    .query(({ input }) => getLambingLog(input)),

  // ─── RECORD BIRTH ───────────────────────────────────────────────────────────
  recordBirth: staffProcedure
    .input(
      z.object({
        birthDate: z.string(),
        damId: z.number().optional(),
        sireId: z.number().optional(),
        sex: z.enum(["male", "female"]),
        birthTypeId: z.number(),
        birthWeightKg: z.string().optional(),
        groupId: z.number().optional(),
        notes: z.string().optional(),
        // If multiple births (twins/triplets), call multiple times
        count: z.number().min(1).max(10).default(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const results = [];

      // Get lamb category (first category with "Lamb" in name, or speciesId from dam)
      const allCats = await getAllCategories();
      const lambCat = allCats.find((c: { id: number; name: string; idPrefix: string }) => c.name.toLowerCase().includes("lamb") || c.name.toLowerCase().includes("baby"));

      for (let i = 0; i < input.count; i++) {
        let lambId = `LAMB-${Date.now()}-${i}`;

        if (lambCat) {
          const seq = await incrementCategorySequence(lambCat.id);
          lambId = `${lambCat.idPrefix}${String(seq).padStart(4, "0")}`;
        }

        const record = await createLambingRecord({
          lambId,
          birthDate: input.birthDate as any,
          damId: input.damId,
          sireId: input.sireId,
          sex: input.sex,
          birthTypeId: input.birthTypeId,
          birthWeightKg: input.birthWeightKg,
          groupId: input.groupId,
          notes: input.notes,
          createdBy: ctx.user?.id,
        });

        results.push({ ...record, lambId });
      }

      await createAuditEntry({
        userId: ctx.user?.id,
        action: "create",
        entityType: "lambing_log",
        entityId: results[0]?.lambId ?? "unknown",
        newValues: input as any,
      });

      return results;
    }),

  // ─── PROMOTE LAMB TO ANIMAL REGISTRY ────────────────────────────────────────
  promoteLamb: staffProcedure
    .input(
      z.object({
        lambingLogId: z.number(),
        categoryId: z.number(),
        speciesId: z.number(),
        groupId: z.number(),
        statusId: z.number(),
        acquisitionDate: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const lambRecords = await getLambingLog();
      const lamb = lambRecords.find((l: any) => l.id === input.lambingLogId);
      if (!lamb) throw new Error("Lambing record not found");
      if (lamb.isPromoted) throw new Error("Lamb already promoted");

      const seq = await incrementCategorySequence(input.categoryId);
      const cats = await getAllCategories();
      const cat = cats.find((c: { id: number; idPrefix: string }) => c.id === input.categoryId);
      const prefix = cat?.idPrefix ?? "A-";
      const animalId = `${prefix}${String(seq).padStart(4, "0")}`;

      const result = await createAnimal({
        animalId,
        speciesId: input.speciesId,
        categoryId: input.categoryId,
        groupId: input.groupId,
        statusId: input.statusId,
        sex: lamb.sex,
        acquisitionType: "born",
        acquisitionDate: input.acquisitionDate as any,
        birthDate: lamb.birthDate,
        damId: lamb.damId,
        sireId: lamb.sireId,
        weightAtAcquisition: lamb.birthWeightKg,
        createdBy: ctx.user?.id,
      });

      const insertId = (result as any).insertId;
      await recordStatusChange({
        animalId: insertId,
        newStatusId: input.statusId,
        changedBy: ctx.user?.id,
        notes: "Promoted from lambing log",
      });

      await updateLambingRecord(input.lambingLogId, {
        isPromoted: true,
        promotedHeadId: insertId,
      });

      return { animalId, insertId };
    }),
});
