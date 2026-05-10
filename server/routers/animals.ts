import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAnimal,
  createAuditEntry,
  createNotification,
  createSale,
  createWeightEntry,
  getAnimalById,
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
  create: protectedProcedure
    .input(
      z.object({
        categoryId: z.number(),
        speciesId: z.number(),
        groupId: z.number(),
        statusId: z.number(),
        sex: z.enum(["male", "female"]),
        acquisitionType: z.enum(["purchased", "born"]),
        acquisitionDate: z.string(),
        birthDate: z.string(),
        damId: z.number().optional(),
        sireId: z.number().optional(),
        purchaseCost: z.string().optional(),
        weightAtAcquisition: z.string().optional(),
        notes: z.string().optional(),
      })
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
        entityType: "animal",
        entityId: animalId,
        newValues: input as any,
      });

      return { ...result, animalId };
    }),

  // ─── UPDATE ─────────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        groupId: z.number().optional(),
        statusId: z.number().optional(),
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
        entityType: "animal",
        entityId: String(id),
        oldValues: existing as any,
        newValues: data as any,
      });

      return { success: true };
    }),

  // ─── EXIT ANIMAL ────────────────────────────────────────────────────────────
  exit: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        exitDate: z.string(),
        exitReason: z.string(),
        newStatusId: z.number(),
        // Sale details (optional)
        salePrice: z.string().optional(),
        weightAtSale: z.string().optional(),
        buyerName: z.string().optional(),
        saleNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await getAnimalById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await updateAnimal(input.id, {
        statusId: input.newStatusId,
        exitDate: input.exitDate as any,
        exitReason: input.exitReason,
        isActive: false,
      });

      await recordStatusChange({
        animalId: input.id,
        previousStatusId: existing.animal.statusId,
        newStatusId: input.newStatusId,
        changedBy: ctx.user?.id,
        notes: input.exitReason,
      });

      // Record sale if price provided
      if (input.salePrice) {
        await createSale({
          animalId: input.id,
          saleDate: input.exitDate as any,
          salePrice: input.salePrice,
          weightAtSale: input.weightAtSale,
          pricePerKg: input.weightAtSale && input.salePrice
            ? String(parseFloat(input.salePrice) / parseFloat(input.weightAtSale))
            : undefined,
          buyerName: input.buyerName,
          notes: input.saleNotes,
          createdBy: ctx.user?.id,
        });
      }

      await createAuditEntry({
        userId: ctx.user?.id,
        action: "exit",
        entityType: "animal",
        entityId: String(input.id),
        newValues: { exitDate: input.exitDate, exitReason: input.exitReason } as any,
      });

      return { success: true };
    }),

  // ─── STATUS HISTORY ─────────────────────────────────────────────────────────
  getStatusHistory: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getAnimalStatusHistory(input.animalId)),

  // ─── WEIGHT LOG ─────────────────────────────────────────────────────────────
  getWeightLog: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getWeightLog(input.animalId)),

  addWeight: protectedProcedure
    .input(
      z.object({
        animalId: z.number(),
        weighDate: z.string(),
        weightKg: z.string(),
        notes: z.string().optional(),
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

      return result;
    }),

  // ─── P&L ────────────────────────────────────────────────────────────────────
  getPnL: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(({ input }) => getAnimalPnL(input.animalId)),

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
