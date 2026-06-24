import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { extractAnimalIdNumber } from "@shared/animalIds";
import { hasPermission } from "@shared/permissions";
import { getClientIp } from "../_core/audit";
import { composeAnimalIdOrThrow, sequenceValueFromAnimalIdNumber } from "../_core/animalIds";
import { isDuplicateEntryError } from "../_core/databaseErrors";
import { anyPermissionProcedure, permissionProcedure, router } from "../_core/trpc";
import { optionalAnimalIdNumber, optionalMoneyString, optionalWeightString, weightString, pastOrTodayDate } from "../_core/validators";
import { storagePut, storageGetSignedUrl } from "../storage";
import {
  checkAndStageAnimal,
  createAnimal,
  createAuditEntry,
  createNotification,
  createSale,
  createWeightEntry,
  getWeightEntryById,
  softDeleteWeightEntry,
  getDb,
  getAllCategories,
  getAllGroups,
  getAllOwners,
  getAllStatuses,
  ensureCategorySequenceAtLeast,
  generateNextAnimalId,
  getAnimalById,
  getAnimalsByIds,
  getRawAnimalByAnimalId,
  getRawAnimalForUpdate,
  getRawAnimalById,
  getCategoryForUpdate,
  getStatusById,
  getAllAnimalsPnL,
  getAnimalPnL,
  getGeneralExpensesTotal,
  getAnimalStatusHistory,
  getAnimals,
  getExpenses,
  getRationPlans,
  getSales,
  getWeightLog,
  recordStatusChange,
  updateAnimal,
} from "../db";

async function validateAnimalReferences(input: {
  animalId?: number;
  speciesId: number;
  categoryId: number;
  groupId?: number;
  statusId?: number;
  ownerId?: number | null;
  damId?: number | null;
  sireId?: number | null;
}) {
  const [groups, statuses, owners, dam, sire] = await Promise.all([
    input.groupId ? getAllGroups(input.speciesId) : Promise.resolve([]),
    input.statusId ? getAllStatuses() : Promise.resolve([]),
    input.ownerId ? getAllOwners() : Promise.resolve([]),
    input.damId ? getRawAnimalById(input.damId) : Promise.resolve(null),
    input.sireId ? getRawAnimalById(input.sireId) : Promise.resolve(null),
  ]);

  if (input.groupId) {
    const group = groups.find((item: any) => item.id === input.groupId);
    if (!group?.isActive ||
        (group.speciesId && group.speciesId !== input.speciesId) ||
        (group.categoryId && group.categoryId !== input.categoryId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selected group is not valid for this animal" });
    }
  }
  if (input.statusId) {
    const status = statuses.find((item: any) => item.id === input.statusId);
    if (!status?.isActive) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selected status is not active" });
    }
  }
  if (input.ownerId && !owners.some((item: any) => item.id === input.ownerId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selected owner is not active" });
  }
  if (input.damId &&
      (input.damId === input.animalId ||
       !dam ||
       dam.deletedAt ||
       !dam.isActive ||
       dam.sex !== "female" ||
       dam.speciesId !== input.speciesId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selected dam is not valid" });
  }
  if (input.sireId &&
      (input.sireId === input.animalId ||
       !sire ||
       sire.deletedAt ||
       !sire.isActive ||
       sire.sex !== "male" ||
       sire.speciesId !== input.speciesId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selected sire is not valid" });
  }
}

export const animalsRouter = router({
  // ─── LIST ───────────────────────────────────────────────────────────────────
  list: permissionProcedure("animals", "view")
    .input(
      z.object({
        speciesId: z.number().optional(),
        categoryId: z.number().optional(),
        groupId: z.number().optional(),
        statusId: z.number().optional(),
        ownerId: z.number().optional(),
        acquisitionType: z.string().optional(),
        isActive: z.boolean().optional(),
      }).optional()
    )
    .query(({ input }) => getAnimals(input ?? {})),

  lookup: anyPermissionProcedure([
    ["animals", "view"],
    ["breeding", "view"],
    ["vaccinations", "view"],
    ["expenses", "view"],
    ["sales", "view"],
  ])
    .input(z.object({
      speciesId: z.number().int().positive().optional(),
      isActive: z.boolean().optional(),
      sex: z.enum(["male", "female"]).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).optional())
    .query(async ({ input }) => {
      const rows = await getAnimals({ ...input, limit: input?.limit ?? 500 });
      return rows.map(row => ({
        animal: {
          id: row.animal.id,
          animalId: row.animal.animalId,
          sex: row.animal.sex,
        },
      }));
    }),

  listFattening: permissionProcedure("fattening", "view")
    .input(z.object({ ownerId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const rows = await getAnimals({ isActive: true, ownerId: input?.ownerId });
      return rows.map(row => ({
        animal: {
          id: row.animal.id,
          animalId: row.animal.animalId,
          acquisitionDate: row.animal.acquisitionDate,
          weightAtAcquisition: row.animal.weightAtAcquisition,
        },
        categoryName: row.categoryName,
        groupName: row.groupName,
        statusName: row.statusName,
        latestWeightKg: row.latestWeightKg,
        targetWeightKg: row.targetWeightKg,
      }));
    }),

  // ─── GET BY ID ──────────────────────────────────────────────────────────────
  getById: permissionProcedure("animals", "view")
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const animal = await getAnimalById(input.id);
      if (!animal) throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found" });
      return animal;
    }),

  // ─── CREATE ─────────────────────────────────────────────────────────────────
  create: permissionProcedure("animals", "create")
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        speciesId: z.number().int().positive(),
        groupId: z.number().int().positive(),
        statusId: z.number().int().positive(),
        sex: z.enum(["male", "female"]),
        acquisitionType: z.enum(["purchased", "born"]),
        acquisitionDate: pastOrTodayDate,
        birthDate: pastOrTodayDate,
        damId: z.number().int().positive().optional(),
        sireId: z.number().int().positive().optional(),
        ownerId: z.number().int().positive().optional(),
        purchaseCost: optionalMoneyString,
        weightAtAcquisition: optionalWeightString,
        notes: z.string().max(2000).optional(),
        animalIdNumber: optionalAnimalIdNumber,
      }).refine(
        (d) => new Date(d.birthDate) <= new Date(d.acquisitionDate),
        { message: "Birth date cannot be after acquisition date", path: ["birthDate"] }
      )
    )
    .mutation(async ({ input, ctx }) => {
      const cats = await getAllCategories(input.speciesId);
      const cat = cats.find((c: { id: number; idPrefix: string }) => c.id === input.categoryId);
      if (!cat || cat.speciesId !== input.speciesId || !cat.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected category is not valid for this species" });
      }
      await validateAnimalReferences({
        speciesId: input.speciesId,
        categoryId: input.categoryId,
        groupId: input.groupId,
        statusId: input.statusId,
        ownerId: input.ownerId,
        damId: input.damId,
        sireId: input.sireId,
      });

      const { animalIdNumber, ...animalInput } = input;
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }
      try {
        return await db.transaction(async (tx) => {
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
          let animalId: string;
          if (animalIdNumber) {
            animalId = composeAnimalIdOrThrow(lockedCat.idPrefix, animalIdNumber);
            if (await getRawAnimalByAnimalId(animalId, tx)) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Animal ID already exists or is in the Recycle Bin",
              });
            }
            const manualSequence = sequenceValueFromAnimalIdNumber(animalIdNumber);
            if (manualSequence !== null) {
              await ensureCategorySequenceAtLeast(input.categoryId, manualSequence, tx);
            }
          } else {
            animalId = await generateNextAnimalId(
              input.categoryId,
              lockedCat.idPrefix,
              tx,
            );
          }

          const result = await createAnimal({
            ...animalInput,
            animalId,
            acquisitionDate: input.acquisitionDate as any,
            birthDate: input.birthDate as any,
            createdBy: ctx.user?.id,
          }, tx);

          await recordStatusChange({
            animalId: (result as any).insertId,
            newStatusId: input.statusId,
            changedBy: ctx.user?.id,
            notes: "Initial registration",
          }, tx);

          await createAuditEntry({
            userId: ctx.user?.id,
            action: "create",
            ipAddress: getClientIp(ctx),
            entityType: "animal",
            entityId: animalId,
            // animalDbId is the numeric row id the revert engine soft-deletes.
            newValues: { ...input, animalId, animalDbId: (result as any).insertId } as any,
          }, tx);

          return { ...result, animalId };
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDuplicateEntryError(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Animal ID already exists or is in the Recycle Bin",
          });
        }
        console.error("[Animals] Animal creation failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not register animal. Try again.",
        });
      }
    }),

  // ─── UPDATE ─────────────────────────────────────────────────────────────────
  update: permissionProcedure("animals", "update")
    .input(
      z.object({
        id: z.number(),
        categoryId: z.number().int().positive().optional(),
        groupId: z.number().optional(),
        statusId: z.number().optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        sex: z.enum(["male", "female"]).optional(),
        acquisitionDate: pastOrTodayDate.optional(),
        birthDate: pastOrTodayDate.optional(),
        purchaseCost: optionalMoneyString,
        notes: z.string().max(2000).optional(),
        exitDate: pastOrTodayDate.optional(),
        exitReason: z.string().max(1000).optional(),
        isActive: z.boolean().optional(),
        damId: z.number().int().positive().nullable().optional(),
        sireId: z.number().int().positive().nullable().optional(),
        animalIdNumber: optionalAnimalIdNumber,
      })
    )
    .mutation(async ({ input: { id, animalIdNumber, ...data }, ctx }) => {
      const existing = await getAnimalById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const cats = await getAllCategories();
      const currentCat = cats.find((cat: any) => cat.id === existing.animal.categoryId);
      const targetCategoryId = data.categoryId ?? existing.animal.categoryId;
      const targetCat = cats.find((cat: any) => cat.id === targetCategoryId);
      if (!targetCat ||
          targetCat.speciesId !== existing.animal.speciesId ||
          (!targetCat.isActive && targetCategoryId !== existing.animal.categoryId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected category is not valid for this animal" });
      }
      await validateAnimalReferences({
        animalId: id,
        speciesId: existing.animal.speciesId,
        categoryId: targetCategoryId,
        groupId: data.groupId ??
          (targetCategoryId !== existing.animal.categoryId
            ? existing.animal.groupId
            : undefined),
        statusId: data.statusId,
        ownerId: data.ownerId,
        damId: data.damId,
        sireId: data.sireId,
      });

      // Cross-field date sanity using incoming values where provided,
      // falling back to the stored ones.
      const birth = data.birthDate ?? String(existing.animal.birthDate).split("T")[0];
      const acq = data.acquisitionDate ?? String(existing.animal.acquisitionDate).split("T")[0];
      const exit = data.exitDate ?? (existing.animal.exitDate ? String(existing.animal.exitDate).split("T")[0] : null);
      if (birth && acq && birth > acq) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Birth date cannot be after acquisition date" });
      }
      if (exit && acq && exit < acq) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Exit date cannot be before acquisition date" });
      }

      // If exit status set, cascade isActive = false
      if (data.exitDate || existing.isExitStatus) {
        data.isActive = false;
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }
      try {
        await db.transaction(async (tx) => {
          const lockedAnimal = await getRawAnimalForUpdate(id, tx);
          if (!lockedAnimal || lockedAnimal.deletedAt) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found" });
          }
          const changedWhileEditing =
            lockedAnimal.categoryId !== existing.animal.categoryId ||
            lockedAnimal.animalId !== existing.animal.animalId ||
            (lockedAnimal.updatedAt &&
             existing.animal.updatedAt &&
             new Date(lockedAnimal.updatedAt).getTime() !==
               new Date(existing.animal.updatedAt).getTime());
          if (changedWhileEditing) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Animal changed while editing. Reopen it and try again.",
            });
          }
          const lockedTargetCat = await getCategoryForUpdate(targetCategoryId, tx);
          if (!lockedTargetCat ||
              lockedTargetCat.deletedAt ||
              lockedTargetCat.speciesId !== existing.animal.speciesId ||
              (!lockedTargetCat.isActive &&
               targetCategoryId !== existing.animal.categoryId)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Selected category is no longer available",
            });
          }
          let nextAnimalId = existing.animal.animalId;
          let controlledNumber = animalIdNumber;
          if (!controlledNumber && targetCategoryId !== existing.animal.categoryId) {
            controlledNumber = extractAnimalIdNumber(
              existing.animal.animalId,
              currentCat?.idPrefix ?? "",
            ) || undefined;
          }

          if (controlledNumber) {
            nextAnimalId = composeAnimalIdOrThrow(
              lockedTargetCat.idPrefix,
              controlledNumber,
            );
            const duplicate = await getRawAnimalByAnimalId(nextAnimalId, tx);
            if (duplicate && duplicate.id !== id) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Animal ID already exists or is in the Recycle Bin",
              });
            }
            const sequence = sequenceValueFromAnimalIdNumber(controlledNumber);
            if (sequence !== null) {
              await ensureCategorySequenceAtLeast(targetCategoryId, sequence, tx);
            }
          } else if (targetCategoryId !== existing.animal.categoryId) {
            nextAnimalId = await generateNextAnimalId(
              targetCategoryId,
              lockedTargetCat.idPrefix,
              tx,
            );
          }

          if (data.statusId && data.statusId !== existing.animal.statusId) {
            await recordStatusChange({
              animalId: id,
              previousStatusId: existing.animal.statusId,
              newStatusId: data.statusId,
              changedBy: ctx.user?.id,
            }, tx);
          }

          await updateAnimal(id, {
            ...data,
            animalId: nextAnimalId,
            acquisitionDate: data.acquisitionDate as any,
            birthDate: data.birthDate as any,
            exitDate: data.exitDate as any,
            updatedAt: new Date(),
          }, tx);

          await createAuditEntry({
            userId: ctx.user?.id,
            action: "update",
            ipAddress: getClientIp(ctx),
            entityType: "animal",
            entityId: String(id),
            oldValues: existing as any,
            newValues: { ...data, animalId: nextAnimalId } as any,
          }, tx);
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDuplicateEntryError(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Animal ID already exists or is in the Recycle Bin",
          });
        }
        console.error("[Animals] Animal update failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not update animal. Try again.",
        });
      }

      return { success: true };
    }),

  // ─── EXIT ANIMAL ────────────────────────────────────────────────────────────
  exit: permissionProcedure("sales", "create")
    .input(
      z.object({
        id: z.number().int().positive(),
        exitDate: pastOrTodayDate,
        exitReason: z.string().min(1).max(1000),
        newStatusId: z.number().int().positive(),
        // Sale details (optional)
        salePrice: optionalMoneyString,
        amountPaid: optionalMoneyString,
        weightAtSale: optionalWeightString,
        buyerName: z.string().max(100).optional(),
        saleNotes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await getAnimalById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // F3 guard: refuse to re-exit an animal that is already inactive/exited.
      if (existing.animal.isActive === false) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${existing.animal.animalId} is already exited. Use the Sales page to edit its sale instead.`,
        });
      }

      // F4 guard: the chosen new status must actually be an exit status.
      const newStatus = await getStatusById(input.newStatusId);
      if (!newStatus) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected status not found" });
      if (!newStatus.isExitStatus) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot exit into status "${newStatus.name}" — it is not marked as an exit status. Pick a status flagged isExitStatus in Configuration.`,
        });
      }

      // Validate exit date is not before acquisition
      if (new Date(input.exitDate) < new Date(String(existing.animal.acquisitionDate))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Exit date cannot be before acquisition date" });
      }
      if (input.salePrice !== undefined && parseFloat(input.salePrice) < 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sale price cannot be negative" });
      }
      if (input.amountPaid !== undefined && input.salePrice !== undefined &&
          parseFloat(input.amountPaid) > parseFloat(input.salePrice)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Amount paid cannot exceed sale price" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // All-or-nothing: animal update + status history + sale + audit
      await db.transaction(async (tx) => {
        await updateAnimal(input.id, {
          statusId: input.newStatusId,
          exitDate: input.exitDate as any,
          exitReason: input.exitReason,
          isActive: false,
        }, tx);

        await recordStatusChange({
          animalId: input.id,
          previousStatusId: existing.animal.statusId,
          newStatusId: input.newStatusId,
          changedBy: ctx.user?.id,
          notes: input.exitReason,
        }, tx);

        let saleId: number | undefined;
        if (input.salePrice) {
          const saleResult = await createSale({
            animalId: input.id,
            saleDate: input.exitDate as any,
            salePrice: input.salePrice,
            amountPaid: input.amountPaid ?? input.salePrice,
            weightAtSale: input.weightAtSale,
            pricePerKg: input.weightAtSale && input.salePrice
              ? String(parseFloat(input.salePrice) / parseFloat(input.weightAtSale))
              : undefined,
            buyerName: input.buyerName,
            notes: input.saleNotes,
            createdBy: ctx.user?.id,
          }, tx);
          saleId = (saleResult as any)?.insertId;
        }

        await createAuditEntry({
          userId: ctx.user?.id,
          action: "exit",
          ipAddress: getClientIp(ctx),
          entityType: "animal",
          entityId: String(input.id),
          // Prior state so the revert can reactivate the animal exactly.
          oldValues: { isActive: true, statusId: existing.animal.statusId, exitDate: null, exitReason: null } as any,
          newValues: { exitDate: input.exitDate, exitReason: input.exitReason, saleId } as any,
        }, tx);
      });

      return { success: true };
    }),

  // ─── BULK EXIT / SELL MANY ──────────────────────────────────────────────────
  // Sell or exit several animals together in a single atomic transaction.
  // Shared: exit date, reason, status, optional buyer + sale notes.
  // Per animal: sale price + amount paid + weight at sale.
  bulkExit: permissionProcedure("sales", "create")
    .input(
      z.object({
        exitDate: pastOrTodayDate,
        exitReason: z.string().min(1).max(1000),
        newStatusId: z.number().int().positive(),
        buyerName: z.string().max(100).optional(),
        saleNotes: z.string().max(2000).optional(),
        animals: z
          .array(
            z.object({
              id: z.number().int().positive(),
              salePrice: optionalMoneyString,
              amountPaid: optionalMoneyString,
              weightAtSale: optionalWeightString,
            })
          )
          .min(1, "Select at least one animal")
          .max(500, "Too many animals in one batch"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // F4 guard: the chosen new status must actually be an exit status.
      const newStatus = await getStatusById(input.newStatusId);
      if (!newStatus) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected status not found" });
      if (!newStatus.isExitStatus) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot exit into status "${newStatus.name}" — it is not marked as an exit status.`,
        });
      }

      // P1 perf + F3 guard: ONE query for all selected animals. Reject already-
      // exited animals BEFORE any write so a stray click can't double-sell.
      const ids = input.animals.map((a) => a.id);
      const fetched = await getAnimalsByIds(ids);
      const byId = new Map(fetched.map((r: any) => [r.animal.id, r]));

      const prepared: Array<{
        id: number;
        existing: any;
        salePrice?: string;
        amountPaid?: string;
        weightAtSale?: string;
      }> = [];
      for (const a of input.animals) {
        const existing = byId.get(a.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: `Animal ${a.id} not found` });
        if (existing.animal.isActive === false) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${existing.animal.animalId} is already exited. Remove it from the selection.`,
          });
        }
        if (new Date(input.exitDate) < new Date(String(existing.animal.acquisitionDate))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Exit date is before acquisition for ${existing.animal.animalId}` });
        }
        if (a.salePrice !== undefined && parseFloat(a.salePrice) < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Sale price cannot be negative for ${existing.animal.animalId}` });
        }
        if (a.amountPaid !== undefined && a.salePrice !== undefined &&
            parseFloat(a.amountPaid) > parseFloat(a.salePrice)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Amount paid exceeds sale price for ${existing.animal.animalId}` });
        }
        prepared.push({ id: a.id, existing, salePrice: a.salePrice, amountPaid: a.amountPaid, weightAtSale: a.weightAtSale });
      }

      // All-or-nothing: every animal's update + history + sale + audit in one transaction.
      await db.transaction(async (tx) => {
        for (const p of prepared) {
          await updateAnimal(p.id, {
            statusId: input.newStatusId,
            exitDate: input.exitDate as any,
            exitReason: input.exitReason,
            isActive: false,
          }, tx);

          await recordStatusChange({
            animalId: p.id,
            previousStatusId: p.existing.animal.statusId,
            newStatusId: input.newStatusId,
            changedBy: ctx.user?.id,
            notes: input.exitReason,
          }, tx);

          let bulkSaleId: number | undefined;
          if (p.salePrice) {
            const saleResult = await createSale({
              animalId: p.id,
              saleDate: input.exitDate as any,
              salePrice: p.salePrice,
              amountPaid: p.amountPaid ?? p.salePrice,
              weightAtSale: p.weightAtSale,
              pricePerKg: p.weightAtSale && p.salePrice
                ? String(parseFloat(p.salePrice) / parseFloat(p.weightAtSale))
                : undefined,
              buyerName: input.buyerName,
              notes: input.saleNotes,
              createdBy: ctx.user?.id,
            }, tx);
            bulkSaleId = (saleResult as any)?.insertId;
          }

          await createAuditEntry({
            userId: ctx.user?.id,
            action: "exit",
            ipAddress: getClientIp(ctx),
            entityType: "animal",
            entityId: String(p.id),
            oldValues: { isActive: true, statusId: p.existing.animal.statusId, exitDate: null, exitReason: null } as any,
            newValues: {
              bulkExit: true,
              exitDate: input.exitDate,
              exitReason: input.exitReason,
              salePrice: p.salePrice,
              amountPaid: p.amountPaid,
              saleId: bulkSaleId,
            } as any,
          }, tx);
        }
      });

      return { success: true, count: prepared.length };
    }),


  // ─── BULK UPDATE ────────────────────────────────────────────────────────────
  // Apply the same changes to multiple animals at once. Every field is
  // optional — only fields the operator actually sets get written.
  // Works on both active and exited animals.
  bulkUpdate: permissionProcedure("animals", "update")
    .input(
      z.object({
        animalIds: z.array(z.number().int().positive()).min(1).max(500),
        // Each field is optional; undefined means "leave alone".
        groupId: z.number().int().positive().nullable().optional(),
        statusId: z.number().int().positive().optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        sex: z.enum(["male", "female"]).optional(),
        acquisitionDate: pastOrTodayDate.optional(),
        notes: z.string().max(2000).nullable().optional(),
        isActive: z.boolean().optional(),
        exitDate: pastOrTodayDate.optional(),
        exitReason: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { animalIds, ...changes } = input;

      // Reject empty change sets — nothing to do.
      const changeKeys = Object.keys(changes).filter((k) => (changes as any)[k] !== undefined);
      if (changeKeys.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // P1 perf: ONE query for all selected animals (was N+1).
      const fetched = await getAnimalsByIds(animalIds);
      const byId = new Map(fetched.map((r: any) => [r.animal.id, r]));
      const targets: any[] = [];
      for (const id of animalIds) {
        const existing = byId.get(id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: `Animal ${id} not found` });
        targets.push(existing);
      }

      // Cross-field validation: if acquisitionDate is being changed, it cannot
      // land after any existing exit date for the same animal.
      if (changes.acquisitionDate) {
        for (const t of targets) {
          const exit = t.animal.exitDate ? String(t.animal.exitDate).split("T")[0] : null;
          if (exit && changes.acquisitionDate > exit) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Acquisition date is after exit date for ${t.animal.animalId}`,
            });
          }
        }
      }
      // exit date must be ≥ acquisition for each animal it applies to.
      if (changes.exitDate) {
        for (const t of targets) {
          const acq = changes.acquisitionDate ?? String(t.animal.acquisitionDate).split("T")[0];
          if (changes.exitDate < acq) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Exit date is before acquisition date for ${t.animal.animalId}`,
            });
          }
        }
      }

      // Build the update payload for updateAnimal, normalising nullable fields.
      const updatePayload: any = {};
      if (changes.groupId !== undefined) updatePayload.groupId = changes.groupId;
      if (changes.statusId !== undefined) updatePayload.statusId = changes.statusId;
      if (changes.ownerId !== undefined) updatePayload.ownerId = changes.ownerId;
      if (changes.sex !== undefined) updatePayload.sex = changes.sex;
      if (changes.acquisitionDate !== undefined) updatePayload.acquisitionDate = changes.acquisitionDate;
      if (changes.notes !== undefined) updatePayload.notes = changes.notes;
      if (changes.isActive !== undefined) updatePayload.isActive = changes.isActive;
      if (changes.exitDate !== undefined) updatePayload.exitDate = changes.exitDate;
      if (changes.exitReason !== undefined) updatePayload.exitReason = changes.exitReason;

      // All-or-nothing transaction. Each animal updated, status change recorded
      // when applicable, and a per-animal audit entry written.
      await db.transaction(async (tx) => {
        for (const t of targets) {
          const before: any = {
            groupId: t.animal.groupId,
            statusId: t.animal.statusId,
            ownerId: t.animal.ownerId,
            sex: t.animal.sex,
            acquisitionDate: t.animal.acquisitionDate,
            notes: t.animal.notes,
            isActive: t.animal.isActive,
            exitDate: t.animal.exitDate,
            exitReason: t.animal.exitReason,
          };

          await updateAnimal(t.animal.id, updatePayload, tx);

          // Record a status-history row when statusId actually changed.
          if (changes.statusId !== undefined && changes.statusId !== t.animal.statusId) {
            await recordStatusChange({
              animalId: t.animal.id,
              previousStatusId: t.animal.statusId,
              newStatusId: changes.statusId,
              changedBy: ctx.user?.id,
              notes: "Bulk update",
            }, tx);
          }

          await createAuditEntry({
            userId: ctx.user?.id,
            action: "bulk_update",
            ipAddress: getClientIp(ctx),
            entityType: "animal",
            entityId: String(t.animal.id),
            oldValues: before,
            newValues: updatePayload,
          }, tx);
        }
      });

      return { success: true, count: targets.length, fieldsChanged: changeKeys };
    }),

  // ─── STATUS HISTORY ─────────────────────────────────────────────────────────
  getStatusHistory: permissionProcedure("animals", "view")
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getAnimalStatusHistory(input.animalId)),

  // ─── WEIGHT LOG ─────────────────────────────────────────────────────────────
  getWeightLog: anyPermissionProcedure([
    ["animals", "view"],
    ["fattening", "view"],
  ])
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getWeightLog(input.animalId)),

  addWeight: permissionProcedure("fattening", "create")
    .input(
      z.object({
        animalId: z.number().int().positive(),
        weighDate: pastOrTodayDate,
        weightKg: weightString,
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const animal = await getAnimalById(input.animalId);
      if (!animal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found" });
      }
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }
      const canAutoStage = hasPermission(
        ctx.user.role,
        ctx.permissionOverrides,
        "animals",
        "update",
      );
      let result;
      let stageResult: Awaited<ReturnType<typeof checkAndStageAnimal>> = {
        staged: false,
      };
      try {
        ({ result, stageResult } = await db.transaction(async (tx) => {
          const lockedAnimal = await getRawAnimalForUpdate(input.animalId, tx);
          if (!lockedAnimal || lockedAnimal.deletedAt) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found" });
          }
          const created = await createWeightEntry({
            animalId: input.animalId,
            weighDate: input.weighDate as any,
            weightKg: input.weightKg,
            notes: input.notes,
            createdBy: ctx.user?.id,
          }, tx);

          const staged = canAutoStage
            ? await checkAndStageAnimal(
                input.animalId,
                parseFloat(input.weightKg),
                ctx.user?.id,
                tx,
              )
            : { staged: false };

          await createAuditEntry({
            userId: ctx.user?.id,
            action: "create",
            ipAddress: getClientIp(ctx),
            entityType: "weightLog",
            entityId: String((created as any).insertId),
            // When this weight auto-stages the animal to a new category, record the
            // prior category/code so the revert can undo the stage as well.
            newValues: {
              ...input,
              ...(staged.staged
                ? { autoStage: { animalId: input.animalId, previousCategoryId: lockedAnimal.categoryId, previousAnimalCode: lockedAnimal.animalId } }
                : {}),
            } as any,
          }, tx);

          return { result: created, stageResult: staged };
        }));
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[Animals] Weight entry failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not record weight. Try again.",
        });
      }

      // Notifications are best-effort and must not make a committed weight
      // look failed to the caller.
      if (animal?.targetWeightKg) {
        const target = parseFloat(String(animal.targetWeightKg));
        const current = parseFloat(input.weightKg);
        if (current >= target) {
          try {
            await createNotification({
              alertType: "target_weight_reached",
              title: "Target Weight Reached",
              message: `Animal ${stageResult.newAnimalId ?? animal.animal.animalId} has reached target weight of ${target}kg (current: ${current}kg)`,
              relatedEntityType: "animal",
              relatedEntityId: String(input.animalId),
              priority: "high",
            });
          } catch (error) {
            console.error("[Animals] Target-weight notification failed", error);
          }
        }
      }

      return { ...result, autoStaged: stageResult.staged, newAnimalId: stageResult.newAnimalId };
    }),

  // ─── DELETE WEIGHT ENTRY ──────────────────────────────────────────────────
  deleteWeight: permissionProcedure("fattening", "delete")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getWeightEntryById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Weight entry not found" });
      await softDeleteWeightEntry(input.id, ctx.user?.id);
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "delete",
        ipAddress: getClientIp(ctx),
        entityType: "weightLog",
        entityId: String(input.id),
        oldValues: { animalId: existing.animalId, weighDate: existing.weighDate, weightKg: existing.weightKg } as any,
      });
      return { success: true };
    }),

  // ─── P&L ────────────────────────────────────────────────────────────────────
  getPnL: permissionProcedure("pnl", "view")
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getAnimalPnL(input.animalId)),

  getAllPnL: permissionProcedure("pnl", "view")
    .input(z.object({
      speciesId: z.number().optional(),
      categoryId: z.number().optional(),
      ownerId: z.number().optional(),
    }).optional())
    .query(({ input }) => getAllAnimalsPnL(input ?? undefined)),

  getGeneralExpensesTotal: permissionProcedure("pnl", "view")
    .input(z.object({
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    }).optional())
    .query(({ input }) => getGeneralExpensesTotal(input ?? {})),

  // ─── FEED HISTORY ─────────────────────────────────────────────────────────
  getFeedHistory: permissionProcedure("animals", "view")
    .input(z.object({ animalId: z.number() }))
    .query(async ({ input }) => {
      const animal = await getAnimalById(input.animalId);
      if (!animal) throw new TRPCError({ code: "NOT_FOUND" });
      // Return ration plans for this animal's category
      const plans = await getRationPlans(animal.animal.categoryId ?? undefined);
      return plans;
    }),

  // ─── EXPENSE HISTORY ─────────────────────────────────────────────────────
  getExpenseHistory: permissionProcedure("animals", "view")
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getExpenses({ headId: input.animalId })),

  // ─── ANIMAL SALES ────────────────────────────────────────────────────────
  getAnimalSales: permissionProcedure("animals", "view")
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getSales({ animalId: input.animalId })),

  // ─── LINEAGE ────────────────────────────────────────────────────────────────
  getLineage: permissionProcedure("animals", "view")
    .input(z.object({ animalId: z.number() }))
    .query(async ({ input }) => {
      const animal = await getAnimalById(input.animalId);
      if (!animal) throw new TRPCError({ code: "NOT_FOUND" });

      const dam = animal.animal.damId ? await getAnimalById(animal.animal.damId) : null;
      const sire = animal.animal.sireId ? await getAnimalById(animal.animal.sireId) : null;
      const damDam = dam?.animal.damId ? await getAnimalById(dam.animal.damId) : null;
      const damSire = dam?.animal.sireId ? await getAnimalById(dam.animal.sireId) : null;
      const sireDam = sire?.animal.damId ? await getAnimalById(sire.animal.damId) : null;
      const sireSire = sire?.animal.sireId ? await getAnimalById(sire.animal.sireId) : null;

      // Offspring
      const allAnimals = await getAnimals({ isActive: undefined });
      const offspring = allAnimals.filter(
        (a) => a.animal.damId === input.animalId || a.animal.sireId === input.animalId
      );

      return { animal, dam, sire, damDam, damSire, sireDam, sireSire, offspring };
    }),

  // ─── PHOTO ──────────────────────────────────────────────────────────────────
  // Upload an animal photo as a base64 data URL. Stored via the storage layer;
  // the returned key is saved on animals.photoUrl.
  setPhoto: permissionProcedure("animals", "update")
    .input(z.object({
      id: z.number().int().positive(),
      // data URL: "data:image/jpeg;base64,...."
      dataUrl: z.string().refine((s) => /^data:image\/(jpeg|jpg|png|webp);base64,/.test(s), "Must be a JPEG, PNG, or WebP data URL"),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getAnimalById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const match = input.dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image data" });
      const contentType = match[1];
      const buffer = Buffer.from(match[2], "base64");

      // Guard size (~3MB after decode) to avoid runaway uploads.
      if (buffer.length > 3 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Image too large (max 3MB)" });
      }

      const ext = contentType.split("/")[1].replace("jpeg", "jpg");
      const { key } = await storagePut(`animals/${existing.animal.animalId}.${ext}`, buffer, contentType);

      await updateAnimal(input.id, { photoUrl: key } as any);
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "update",
        ipAddress: getClientIp(ctx),
        entityType: "animal",
        entityId: String(input.id),
        newValues: { photoUrl: key } as any,
      });
      return { success: true, key };
    }),

  removePhoto: permissionProcedure("animals", "update")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getAnimalById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await updateAnimal(input.id, { photoUrl: null } as any);
      await createAuditEntry({
        userId: ctx.user?.id,
        action: "update",
        ipAddress: getClientIp(ctx),
        entityType: "animal",
        entityId: String(input.id),
        newValues: { photoUrl: null } as any,
      });
      return { success: true };
    }),

  // Resolve a short-lived signed URL for an animal's stored photo key.
  getPhotoUrl: permissionProcedure("animals", "view")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const existing = await getAnimalById(input.id);
      if (!existing?.animal.photoUrl) return { url: null };
      try {
        const url = await storageGetSignedUrl(existing.animal.photoUrl);
        return { url };
      } catch {
        return { url: null };
      }
    }),
});
