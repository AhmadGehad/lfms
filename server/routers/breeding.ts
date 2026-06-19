import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { composeAnimalIdOrThrow, sequenceValueFromAnimalIdNumber } from "../_core/animalIds";
import { isDuplicateEntryError } from "../_core/databaseErrors";
import { allPermissionsProcedure, permissionProcedure, router } from "../_core/trpc";
import { optionalAnimalIdNumber, optionalMoneyString, optionalWeightString, pastOrTodayDate } from "../_core/validators";
import {
  createLambingRecord,
  createAnimal,
  createAuditEntry,
  ensureCategorySequenceAtLeast,
  getDb,
  getAllCategories,
  getAllSpecies,
  getAllStatuses,
  getAllGroups,
  generateNextAnimalId,
  getLambingLog,
  getLambingRecordForUpdate,
  getCategoryForUpdate,
  getRawAnimalByAnimalId,
  getRawAnimalById,
  getRawOwnerById,
  updateLambingRecord,
  incrementCategorySequence,
  recordStatusChange,
} from "../db";

export const breedingRouter = router({
  // ─── LIST LAMBING RECORDS ───────────────────────────────────────────────────
  listLambing: permissionProcedure("breeding", "view")
    .input(z.object({ isPromoted: z.boolean().optional() }).optional())
    .query(({ input }) => getLambingLog(input)),

  // ─── RECORD BIRTH ───────────────────────────────────────────────────────────
  recordBirth: permissionProcedure("breeding", "create")
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
  promoteLamb: allPermissionsProcedure([
    ["breeding", "update"],
    ["animals", "create"],
  ])
    .input(
      z.object({
        lambingLogId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        speciesId: z.number().int().positive(),
        groupId: z.number().int().positive(),
        statusId: z.number().int().positive(),
        acquisitionDate: pastOrTodayDate,
        animalIdNumber: optionalAnimalIdNumber,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [cats, speciesRows, groupRows, statusRows] = await Promise.all([
        getAllCategories(),
        getAllSpecies(),
        getAllGroups(),
        getAllStatuses(),
      ]);
      const cat = cats.find((item: any) => item.id === input.categoryId);
      const selectedSpecies = speciesRows.find((item: any) => item.id === input.speciesId);
      const group = groupRows.find((item: any) => item.id === input.groupId);
      const status = statusRows.find((item: any) => item.id === input.statusId);

      if (!selectedSpecies?.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected species is not active" });
      }
      if (!cat?.isActive || cat.speciesId !== input.speciesId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected category is not valid for this species" });
      }
      if (!group?.isActive ||
          (group.speciesId && group.speciesId !== input.speciesId) ||
          (group.categoryId && group.categoryId !== input.categoryId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected group is not valid for this animal" });
      }
      if (!status?.isActive || status.isExitStatus) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected initial status is not valid" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // All-or-nothing: lamb re-check + optional sequence bump + animal insert +
      // status history + lamb update + audit — all inside ONE transaction.
      let out;
      try {
        out = await db.transaction(async (tx) => {
          const lamb = await getLambingRecordForUpdate(input.lambingLogId, tx);
          if (!lamb || lamb.deletedAt) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Lambing record not found" });
          }
          if (lamb.isPromoted) {
            throw new TRPCError({ code: "CONFLICT", message: "Lamb already promoted" });
          }

          const lockedCat = await getCategoryForUpdate(input.categoryId, tx);
          if (!lockedCat ||
              lockedCat.deletedAt ||
              !lockedCat.isActive ||
              lockedCat.speciesId !== input.speciesId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selected category is no longer available",
            });
          }

          let dam = null;
          if (lamb.damId) {
            dam = await getRawAnimalById(lamb.damId, tx);
            if (!dam ||
                dam.deletedAt ||
                !dam.isActive ||
                dam.sex !== "female" ||
                dam.speciesId !== input.speciesId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Lamb dam is no longer valid for promotion",
              });
            }
          }
          if (lamb.sireId) {
            const sire = await getRawAnimalById(lamb.sireId, tx);
            if (!sire ||
                sire.deletedAt ||
                !sire.isActive ||
                sire.sex !== "male" ||
                sire.speciesId !== input.speciesId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Lamb sire is no longer valid for promotion",
              });
            }
          }

          // Inherit only an owner that still exists and is active.
          let inheritedOwnerId: number | null = null;
          if (dam?.ownerId) {
            const owner = await getRawOwnerById(dam.ownerId, tx);
            if (owner && !owner.deletedAt && owner.isActive) {
              inheritedOwnerId = owner.id;
            }
          }

          let animalId: string;
          if (input.animalIdNumber) {
            animalId = composeAnimalIdOrThrow(
              lockedCat.idPrefix,
              input.animalIdNumber,
            );
            const existing = await getRawAnimalByAnimalId(animalId, tx);
            if (existing) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Animal ID already exists or is in the Recycle Bin",
              });
            }
          } else {
            animalId = await generateNextAnimalId(
              input.categoryId,
              lockedCat.idPrefix,
              tx,
            );
          }

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
          const manualSequence = input.animalIdNumber
            ? sequenceValueFromAnimalIdNumber(input.animalIdNumber)
            : null;
          if (manualSequence !== null) {
            await ensureCategorySequenceAtLeast(input.categoryId, manualSequence, tx);
          }

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

          await createAuditEntry({
            userId: ctx.user.id,
            action: "promote",
            ipAddress: getClientIp(ctx),
            entityType: "animal",
            entityId: animalId,
            newValues: {
              lambingLogId: input.lambingLogId,
              animalId,
              categoryId: input.categoryId,
              speciesId: input.speciesId,
              groupId: input.groupId,
              statusId: input.statusId,
            },
          }, tx);

          return { animalId, insertId };
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDuplicateEntryError(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Animal ID already exists or is in the Recycle Bin",
          });
        }
        console.error("[Breeding] Lamb promotion failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not promote lamb. Try again.",
        });
      }

      return out;
    }),
});
