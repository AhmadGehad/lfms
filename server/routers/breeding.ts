import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { protectedProcedure, staffProcedure, router } from "../_core/trpc";
import { optionalMoneyString, optionalWeightString, pastOrTodayDate } from "../_core/validators";
import {
  createLambingRecord,
  createAnimal,
  createAuditEntry,
  getDb,
  getAllCategories,
  getAllStatuses,
  getAllGroups,
  getLambingLog,
  getLambingRecordById,
  getRawAnimalById,
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
        birthDate: pastOrTodayDate,
        damId: z.number().int().positive().optional(),
        sireId: z.number().int().positive().optional(),
        sex: z.enum(["male", "female"]),
        birthTypeId: z.number().int().positive(),
        birthWeightKg: optionalWeightString,
        valueUsed: optionalMoneyString,
        groupId: z.number().int().positive().optional(),
        notes: z.string().max(2000).optional(),
        // If multiple births (twins/triplets), call multiple times
        count: z.number().int().min(1).max(10).default(1),
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
          valueUsed: input.valueUsed,
          groupId: input.groupId,
          notes: input.notes,
          createdBy: ctx.user?.id,
        });

        results.push({ ...record, lambId });
      }

      await createAuditEntry({
        userId: ctx.user?.id,
        action: "create",
        ipAddress: getClientIp(ctx),
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
        acquisitionDate: pastOrTodayDate,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const cats = await getAllCategories();
      const cat = cats.find((c: { id: number; idPrefix: string }) => c.id === input.categoryId);
      const prefix = cat?.idPrefix ?? "A-";

      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // All-or-nothing: lamb re-check + sequence bump + animal insert +
      // status history + lamb update — all inside ONE transaction.
      const out = await db.transaction(async (tx) => {
        // F8: re-read the lamb INSIDE the transaction so a concurrent
        // promotion of the same lamb cannot pass the isPromoted check twice.
        const lamb = await getLambingRecordById(input.lambingLogId, tx);
        if (!lamb) throw new Error("Lambing record not found");
        if (lamb.isPromoted) throw new Error("Lamb already promoted");

        // F7: inherit the dam's owner so animals born on-farm stay attributed
        // to the same owner as their mother (owner can be changed later).
        let inheritedOwnerId: number | null = null;
        if (lamb.damId) {
          const dam = await getRawAnimalById(lamb.damId, tx);
          inheritedOwnerId = dam?.ownerId ?? null;
        }

        const seq = await incrementCategorySequence(input.categoryId, tx);
        const animalId = `${prefix}${String(seq).padStart(4, "0")}`;

        const result = await createAnimal({
          animalId,
          speciesId: input.speciesId,
          categoryId: input.categoryId,
          groupId: input.groupId,
          statusId: input.statusId,
          ownerId: inheritedOwnerId,
          sex: lamb.sex,
          acquisitionType: "born",
          acquisitionDate: input.acquisitionDate as any,
          birthDate: lamb.birthDate,
          damId: lamb.damId,
          sireId: lamb.sireId,
          weightAtAcquisition: lamb.birthWeightKg,
          createdBy: ctx.user?.id,
        }, tx);

        const insertId = (result as any).insertId;
        await recordStatusChange({
          animalId: insertId,
          newStatusId: input.statusId,
          changedBy: ctx.user?.id,
          notes: "Promoted from lambing log",
        }, tx);

        await updateLambingRecord(input.lambingLogId, {
          isPromoted: true,
          promotedHeadId: insertId,
        }, tx);

        return { animalId, insertId };
      });

      return out;
    }),
});
