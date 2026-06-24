import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { lambingLog, pregnancyRecords } from "../../drizzle/schema";
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
  ensureCategoryLambSequenceAtLeast,
  getDb,
  getAllCategories,
  getAllBirthTypes,
  getAllSpecies,
  getAllStatuses,
  getAllGroups,
  generateNextAnimalId,
  generateNextLambId,
  getLambingLog,
  getLambingSummary,
  getLambingRecordForUpdate,
  getCategoryForUpdate,
  getRawAnimalByAnimalId,
  getRawAnimalById,
  getRawLambingByLambId,
  getRawOwnerById,
  updateLambingRecord,
  recordStatusChange,
  closePregnancyOnBirth,
} from "../db";

export const breedingRouter = router({
  // ─── LIST LAMBING RECORDS ───────────────────────────────────────────────────
  listLambing: permissionProcedure("breeding", "view")
    .input(z.object({ isPromoted: z.boolean().optional(), ownerId: z.number().optional() }).optional())
    .query(({ input }) => getLambingLog(input)),

  summary: permissionProcedure("breeding", "view")
    .query(() => getLambingSummary()),

  // ─── RECORD BIRTH ───────────────────────────────────────────────────────────
  recordBirth: permissionProcedure("breeding", "create")
    .input(
      z.object({
        speciesId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        birthDate: pastOrTodayDate,
        damId: z.number().int().positive().optional(),
        sireId: z.number().int().positive().optional(),
        sex: z.enum(["male", "female"]),
        birthTypeId: z.number().int().positive(),
        birthWeightKg: optionalWeightString,
        valueUsed: optionalMoneyString,
        groupId: z.number().int().positive().optional(),
        notes: z.string().max(2000).optional(),
        lambIdNumber: optionalAnimalIdNumber,
        // If multiple births (twins/triplets), call multiple times
        count: z.number().int().min(1).max(10).default(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [categories, speciesRows, groups, birthTypes] = await Promise.all([
        getAllCategories(),
        getAllSpecies(),
        getAllGroups(input.speciesId),
        getAllBirthTypes(),
      ]);
      const category = categories.find((row: any) => row.id === input.categoryId);
      const selectedSpecies = speciesRows.find((row: any) => row.id === input.speciesId);
      const group = input.groupId
        ? groups.find((row: any) => row.id === input.groupId)
        : null;
      const birthType = birthTypes.find((row: any) => row.id === input.birthTypeId);

      if (!selectedSpecies?.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected species is not active" });
      }
      if (!category?.isActive || category.speciesId !== input.speciesId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected birth category is not valid for this species" });
      }
      if (input.groupId &&
          (!group?.isActive ||
           (group.speciesId && group.speciesId !== input.speciesId) ||
           (group.categoryId && group.categoryId !== input.categoryId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected group is not valid for this birth category" });
      }
      if (!birthType?.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected birth type is not active" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      try {
        return await db.transaction(async tx => {
          const lockedCategory = await getCategoryForUpdate(input.categoryId, tx);
          if (!lockedCategory ||
              lockedCategory.deletedAt ||
              !lockedCategory.isActive ||
              lockedCategory.speciesId !== input.speciesId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selected birth category is no longer available",
            });
          }

          if (input.damId) {
            const dam = await getRawAnimalById(input.damId, tx);
            if (!dam || dam.deletedAt || !dam.isActive ||
                dam.sex !== "female" || dam.speciesId !== input.speciesId) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Selected dam is not valid" });
            }
          }
          if (input.sireId) {
            const sire = await getRawAnimalById(input.sireId, tx);
            if (!sire || sire.deletedAt || !sire.isActive ||
                sire.sex !== "male" || sire.speciesId !== input.speciesId) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Selected sire is not valid" });
            }
          }

          const results = [];
          for (let i = 0; i < input.count; i += 1) {
            let lambId: string;
            if (input.lambIdNumber && i === 0) {
              lambId = composeAnimalIdOrThrow(
                lockedCategory.idPrefix,
                input.lambIdNumber,
              );
              const existingLamb = await getRawLambingByLambId(lambId, tx);
              if (existingLamb) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "Lamb ID already exists",
                });
              }
              const lambSequence = sequenceValueFromAnimalIdNumber(input.lambIdNumber);
              if (lambSequence !== null) {
                await ensureCategoryLambSequenceAtLeast(input.categoryId, lambSequence, tx);
              }
            } else {
              lambId = await generateNextLambId(
                input.categoryId,
                lockedCategory.idPrefix,
                tx,
              );
            }
            const record = await createLambingRecord({
              lambId,
              speciesId: input.speciesId,
              categoryId: input.categoryId,
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
            }, tx);
            results.push({ ...record, lambId });
          }

          const lambingIds = results.map(r => Number((r as any)?.insertId)).filter(Boolean);

          // Registering a birth against the dam closes her active pregnancy.
          let closedPregnancyId: number | null = null;
          if (input.damId) {
            const [activePreg] = await tx
              .select({ id: pregnancyRecords.id })
              .from(pregnancyRecords)
              .where(and(
                eq(pregnancyRecords.animalId, input.damId),
                eq(pregnancyRecords.status, "active"),
                isNull(pregnancyRecords.deletedAt),
              ))
              .limit(1);
            closedPregnancyId = activePreg?.id ?? null;
            await closePregnancyOnBirth(input.damId, lambingIds[0] ?? null, tx);
          }

          await createAuditEntry({
            userId: ctx.user?.id,
            action: "create",
            ipAddress: getClientIp(ctx),
            entityType: "lambing_log",
            entityId: results[0]?.lambId ?? "unknown",
            // lambingIds + closedPregnancyId let the revert delete the lambs and
            // re-open the dam's pregnancy.
            newValues: { ...input, lambingIds, closedPregnancyId } as any,
          }, tx);

          return results;
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDuplicateEntryError(error)) {
          throw new TRPCError({ code: "CONFLICT", message: "Lamb ID already exists" });
        }
        console.error("[Breeding] Birth recording failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not record birth. Try again.",
        });
      }
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
          if (lamb.speciesId && lamb.speciesId !== input.speciesId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Promotion species must match the recorded birth species",
            });
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
                dam.sex !== "female" ||
                dam.speciesId !== input.speciesId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Lamb dam is not valid for promotion",
              });
            }
          }
          if (lamb.sireId) {
            const sire = await getRawAnimalById(lamb.sireId, tx);
            if (!sire ||
                sire.sex !== "male" ||
                sire.speciesId !== input.speciesId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Lamb sire is not valid for promotion",
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
            promotedAnimalCode: animalId,
            promotedAnimalPurgedAt: null,
          }, tx);

          await createAuditEntry({
            userId: ctx.user.id,
            action: "promote",
            ipAddress: getClientIp(ctx),
            entityType: "animal",
            entityId: animalId,
            newValues: {
              lambingLogId: input.lambingLogId,
              createdAnimalId: insertId,
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

  // ─── UPDATE LAMBING RECORD ──────────────────────────────────────────────────
  updateLambing: permissionProcedure("breeding", "update")
    .input(
      z.object({
        id: z.number().int().positive(),
        lambIdNumber: optionalAnimalIdNumber,
        birthDate: pastOrTodayDate.optional(),
        sex: z.enum(["male", "female"]).optional(),
        birthTypeId: z.number().int().positive().optional(),
        birthWeightKg: optionalWeightString,
        valueUsed: optionalMoneyString,
        groupId: z.number().int().positive().optional(),
        notes: z.string().max(2000).optional(),
        damId: z.number().int().positive().nullable().optional(),
        sireId: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      try {
        return await db.transaction(async (tx) => {
          const lamb = await getLambingRecordForUpdate(input.id, tx);
          if (!lamb || lamb.deletedAt) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Lambing record not found" });
          }
          if (lamb.isPromoted) {
            throw new TRPCError({ code: "CONFLICT", message: "Cannot edit a promoted lambing record" });
          }

          const updateData: Partial<typeof lambingLog.$inferInsert> = {};

          if (input.lambIdNumber !== undefined) {
            const category = (await getAllCategories()).find((c: any) => c.id === lamb.categoryId);
            const prefix = category?.idPrefix ?? "";
            const newLambId = composeAnimalIdOrThrow(prefix, input.lambIdNumber);
            if (newLambId !== lamb.lambId) {
              const existing = await getRawLambingByLambId(newLambId, tx);
              if (existing && existing.id !== input.id) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "Lamb ID already exists",
                });
              }
              updateData.lambId = newLambId;
              const lambSequence = sequenceValueFromAnimalIdNumber(input.lambIdNumber);
              if (lambSequence !== null && lamb.categoryId) {
                await ensureCategoryLambSequenceAtLeast(lamb.categoryId, lambSequence, tx);
              }
            }
          }

          if (input.birthDate !== undefined) updateData.birthDate = input.birthDate as any;
          if (input.sex !== undefined) updateData.sex = input.sex;
          if (input.birthTypeId !== undefined) updateData.birthTypeId = input.birthTypeId;
          if (input.birthWeightKg !== undefined) updateData.birthWeightKg = input.birthWeightKg;
          if (input.valueUsed !== undefined) updateData.valueUsed = input.valueUsed;
          if (input.groupId !== undefined) updateData.groupId = input.groupId;
          if (input.notes !== undefined) updateData.notes = input.notes;
          if (input.damId !== undefined) updateData.damId = input.damId;
          if (input.sireId !== undefined) updateData.sireId = input.sireId;

          if (Object.keys(updateData).length > 0) {
            await updateLambingRecord(input.id, updateData, tx);
          }

          await createAuditEntry({
            userId: ctx.user?.id,
            action: "update",
            ipAddress: getClientIp(ctx),
            entityType: "lambing_log",
            entityId: String(input.id),
            oldValues: lamb as any,
            newValues: updateData as any,
          }, tx);

          return { id: input.id };
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDuplicateEntryError(error)) {
          throw new TRPCError({ code: "CONFLICT", message: "Lamb ID already exists" });
        }
        console.error("[Breeding] Lambing record update failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not update lambing record. Try again.",
        });
      }
    }),
});
