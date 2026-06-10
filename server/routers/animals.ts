import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { protectedProcedure, staffProcedure, router } from "../_core/trpc";
import { optionalMoneyString, optionalWeightString, weightString, pastOrTodayDate } from "../_core/validators";
import {
  checkAndStageAnimal,
  createAnimal,
  createAuditEntry,
  createNotification,
  createSale,
  createWeightEntry,
  getDb,
  getAnimalById,
  getAllAnimalsPnL,
  getAnimalPnL,
  getAnimalStatusHistory,
  getAnimals,
  getExpenses,
  getRationPlans,
  getSales,
  getWeightLog,
  incrementCategorySequence,
  recordStatusChange,
  updateAnimal,
} from "../db";

export const animalsRouter = router({
  // ─── LIST ───────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        speciesId: z.number().optional(),
        categoryId: z.number().optional(),
        groupId: z.number().optional(),
        statusId: z.number().optional(),
        ownerId: z.number().optional(),
        isActive: z.boolean().optional(),
      }).optional()
    )
    .query(({ input }) => getAnimals(input ?? {})),

  // ─── GET BY ID ──────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const animal = await getAnimalById(input.id);
      if (!animal) throw new TRPCError({ code: "NOT_FOUND", message: "Animal not found" });
      return animal;
    }),

  // ─── CREATE ─────────────────────────────────────────────────────────────────
  create: staffProcedure
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
      }).refine(
        (d) => new Date(d.birthDate) <= new Date(d.acquisitionDate),
        { message: "Birth date cannot be after acquisition date", path: ["birthDate"] }
      )
    )
    .mutation(async ({ input, ctx }) => {
      // Auto-generate Animal ID
      const seq = await incrementCategorySequence(input.categoryId);
      // Get category prefix from DB
      const { getAllCategories } = await import("../db");
      const cats = await getAllCategories(input.speciesId);
      const cat = cats.find((c: { id: number; idPrefix: string }) => c.id === input.categoryId);
      const prefix = cat?.idPrefix ?? "A-";
      const animalId = `${prefix}${String(seq).padStart(4, "0")}`;

      const result = await createAnimal({
        ...input,
        animalId,
        acquisitionDate: input.acquisitionDate as any,
        birthDate: input.birthDate as any,
        createdBy: ctx.user?.id,
      });

      // Record initial status
      await recordStatusChange({
        animalId: (result as any).insertId,
        newStatusId: input.statusId,
        changedBy: ctx.user?.id,
        notes: "Initial registration",
      });

      await createAuditEntry({
        userId: ctx.user?.id,
        action: "create",
        ipAddress: getClientIp(ctx),
        entityType: "animal",
        entityId: animalId,
        newValues: input as any,
      });

      return { ...result, animalId };
    }),

  // ─── UPDATE ─────────────────────────────────────────────────────────────────
  update: staffProcedure
    .input(
      z.object({
        id: z.number(),
        groupId: z.number().optional(),
        statusId: z.number().optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        notes: z.string().optional(),
        exitDate: z.string().optional(),
        exitReason: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const existing = await getAnimalById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // If status changed, record history
      if (data.statusId && data.statusId !== existing.animal.statusId) {
        await recordStatusChange({
          animalId: id,
          previousStatusId: existing.animal.statusId,
          newStatusId: data.statusId,
          changedBy: ctx.user?.id,
        });
      }

      // If exit status set, cascade isActive = false
      if (data.exitDate || existing.isExitStatus) {
        data.isActive = false;
      }

      await updateAnimal(id, {
        ...data,
        exitDate: data.exitDate as any,
        updatedAt: new Date(),
      });

      await createAuditEntry({
        userId: ctx.user?.id,
        action: "update",
        ipAddress: getClientIp(ctx),
        entityType: "animal",
        entityId: String(id),
        oldValues: existing as any,
        newValues: data as any,
      });

      return { success: true };
    }),

  // ─── EXIT ANIMAL ────────────────────────────────────────────────────────────
  exit: staffProcedure
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

        if (input.salePrice) {
          await createSale({
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
        }

        await createAuditEntry({
          userId: ctx.user?.id,
          action: "exit",
          ipAddress: getClientIp(ctx),
          entityType: "animal",
          entityId: String(input.id),
          newValues: { exitDate: input.exitDate, exitReason: input.exitReason } as any,
        }, tx);
      });

      return { success: true };
    }),

  // ─── BULK EXIT / SELL MANY ──────────────────────────────────────────────────
  // Sell or exit several animals together in a single atomic transaction.
  // Shared: exit date, reason, status, optional buyer + sale notes.
  // Per animal: sale price + amount paid + weight at sale.
  bulkExit: staffProcedure
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

      // Pre-validate everything before touching any row.
      const prepared: Array<{
        id: number;
        existing: any;
        salePrice?: string;
        amountPaid?: string;
        weightAtSale?: string;
      }> = [];
      for (const a of input.animals) {
        const existing = await getAnimalById(a.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: `Animal ${a.id} not found` });
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

          if (p.salePrice) {
            await createSale({
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
          }

          await createAuditEntry({
            userId: ctx.user?.id,
            action: "exit",
            ipAddress: getClientIp(ctx),
            entityType: "animal",
            entityId: String(p.id),
            newValues: {
              bulkExit: true,
              exitDate: input.exitDate,
              exitReason: input.exitReason,
              salePrice: p.salePrice,
              amountPaid: p.amountPaid,
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
  bulkUpdate: staffProcedure
    .input(
      z.object({
        animalIds: z.array(z.number().int().positive()).min(1).max(500),
        // Each field is optional; undefined means "leave alone".
        groupId: z.number().int().positive().nullable().optional(),
        statusId: z.number().int().positive().optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        sex: z.enum(["M", "F"]).optional(),
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

      // Pre-load all targets so we can validate and capture before-values for audit.
      const targets: any[] = [];
      for (const id of animalIds) {
        const existing = await getAnimalById(id);
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
  getStatusHistory: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getAnimalStatusHistory(input.animalId)),

  // ─── WEIGHT LOG ─────────────────────────────────────────────────────────────
  getWeightLog: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getWeightLog(input.animalId)),

  addWeight: staffProcedure
    .input(
      z.object({
        animalId: z.number().int().positive(),
        weighDate: pastOrTodayDate,
        weightKg: weightString,
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createWeightEntry({
        animalId: input.animalId,
        weighDate: input.weighDate as any,
        weightKg: input.weightKg,
        notes: input.notes,
        createdBy: ctx.user?.id,
      });

      await createAuditEntry({
        userId: ctx.user?.id,
        action: "create",
        ipAddress: getClientIp(ctx),
        entityType: "weightLog",
        entityId: String((result as any).insertId),
        newValues: input as any,
      });

      // Check if target weight reached
      const animal = await getAnimalById(input.animalId);
      if (animal?.targetWeightKg) {
        const target = parseFloat(String(animal.targetWeightKg));
        const current = parseFloat(input.weightKg);
        if (current >= target) {
          await createNotification({
            alertType: "target_weight_reached",
            title: "Target Weight Reached",
            message: `Animal ${animal.animal.animalId} has reached target weight of ${target}kg (current: ${current}kg)`,
            relatedEntityType: "animal",
            relatedEntityId: String(input.animalId),
            priority: "high",
          });
        }
      }

      // ─── Auto-stage check ──────────────────────────────────────────────────
      const stageResult = await checkAndStageAnimal(
        input.animalId,
        parseFloat(input.weightKg),
        ctx.user?.id
      );

      return { ...result, autoStaged: stageResult.staged, newAnimalId: stageResult.newAnimalId };
    }),

  // ─── P&L ────────────────────────────────────────────────────────────────────
  getPnL: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getAnimalPnL(input.animalId)),

  getAllPnL: protectedProcedure
    .input(z.object({
      speciesId: z.number().optional(),
      categoryId: z.number().optional(),
    }).optional())
    .query(({ input }) => getAllAnimalsPnL(input ?? undefined)),

  // ─── FEED HISTORY ─────────────────────────────────────────────────────────
  getFeedHistory: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(async ({ input }) => {
      const animal = await getAnimalById(input.animalId);
      if (!animal) throw new TRPCError({ code: "NOT_FOUND" });
      // Return ration plans for this animal's category
      const plans = await getRationPlans(animal.animal.categoryId ?? undefined);
      return plans;
    }),

  // ─── EXPENSE HISTORY ─────────────────────────────────────────────────────
  getExpenseHistory: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getExpenses({ headId: input.animalId })),

  // ─── ANIMAL SALES ────────────────────────────────────────────────────────
  getAnimalSales: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getSales({ animalId: input.animalId })),

  // ─── LINEAGE ────────────────────────────────────────────────────────────────
  getLineage: protectedProcedure
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
});
