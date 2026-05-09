import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import {
  getAllSpecies, createSpecies, updateSpecies,
  getAllCategories, createCategory, updateCategory,
  getAllStatuses, createStatus, updateStatus,
  getAllGroups, createGroup, updateGroup,
  getAllBirthTypes, createBirthType,
  getAllFeedItems, createFeedItem, updateFeedItem,
  getFeedItemPriceHistory, addFeedItemPrice,
  getAllExpenseCategories, createExpenseCategory,
  getAllExpenseSubCategories, createExpenseSubCategory,
  getAllSettings, upsertSetting,
  getAllUsers, updateUserRole,
} from "../db";

export const configRouter = router({
  // ─── SPECIES ────────────────────────────────────────────────────────────────
  getSpecies: protectedProcedure.query(() => getAllSpecies()),

  createSpecies: protectedProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(({ input }) => createSpecies(input)),

  updateSpecies: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(({ input: { id, ...data } }) => updateSpecies(id, data)),

  // ─── CATEGORIES ─────────────────────────────────────────────────────────────
  getCategories: protectedProcedure
    .input(z.object({ speciesId: z.number().optional() }).optional())
    .query(({ input }) => getAllCategories(input?.speciesId)),

  createCategory: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      speciesId: z.number(),
      idPrefix: z.string().min(1),
      targetWeightKg: z.string().optional(),
      expectedCycleDays: z.number().optional(),
    }))
    .mutation(({ input }) => createCategory(input)),

  updateCategory: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      idPrefix: z.string().optional(),
      targetWeightKg: z.string().optional(),
      expectedCycleDays: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(({ input: { id, ...data } }) => updateCategory(id, data)),

  // ─── STATUSES ───────────────────────────────────────────────────────────────
  getStatuses: protectedProcedure.query(() => getAllStatuses()),

  createStatus: protectedProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional(), isExitStatus: z.boolean().optional() }))
    .mutation(({ input }) => createStatus(input)),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isExitStatus: z.boolean().optional(), isActive: z.boolean().optional() }))
    .mutation(({ input: { id, ...data } }) => updateStatus(id, data)),

  // ─── GROUPS ─────────────────────────────────────────────────────────────────
  getGroups: protectedProcedure
    .input(z.object({ speciesId: z.number().optional() }).optional())
    .query(({ input }) => getAllGroups(input?.speciesId)),

  createGroup: protectedProcedure
    .input(z.object({
      groupCode: z.string().min(1),
      name: z.string().min(1),
      speciesId: z.number().optional(),
      categoryId: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => createGroup(input)),

  updateGroup: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      speciesId: z.number().optional(),
      categoryId: z.number().optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(({ input: { id, ...data } }) => updateGroup(id, data)),

  // ─── BIRTH TYPES ────────────────────────────────────────────────────────────
  getBirthTypes: protectedProcedure.query(() => getAllBirthTypes()),

  createBirthType: protectedProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(({ input }) => createBirthType(input)),

  // ─── FEED ITEMS ─────────────────────────────────────────────────────────────
  getFeedItems: protectedProcedure.query(() => getAllFeedItems()),

  createFeedItem: protectedProcedure
    .input(z.object({ name: z.string().min(1), unit: z.string().optional() }))
    .mutation(({ input }) => createFeedItem(input)),

  updateFeedItem: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), unit: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(({ input: { id, ...data } }) => updateFeedItem(id, data)),

  getFeedItemPriceHistory: protectedProcedure
    .input(z.object({ feedItemId: z.number() }))
    .query(({ input }) => getFeedItemPriceHistory(input.feedItemId)),

  addFeedItemPrice: protectedProcedure
    .input(z.object({
      feedItemId: z.number(),
      effectiveDate: z.string(),
      pricePerUnit: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(({ input }) => addFeedItemPrice(input)),

  // ─── EXPENSE CATEGORIES ─────────────────────────────────────────────────────
  getExpenseCategories: protectedProcedure.query(() => getAllExpenseCategories()),

  createExpenseCategory: protectedProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(({ input }) => createExpenseCategory(input)),

  getExpenseSubCategories: protectedProcedure
    .input(z.object({ categoryId: z.number().optional() }).optional())
    .query(({ input }) => getAllExpenseSubCategories(input?.categoryId)),

  createExpenseSubCategory: protectedProcedure
    .input(z.object({ categoryId: z.number(), name: z.string().min(1), description: z.string().optional() }))
    .mutation(({ input }) => createExpenseSubCategory(input)),

  // ─── SETTINGS ───────────────────────────────────────────────────────────────
  getSettings: protectedProcedure.query(() => getAllSettings()),

  upsertSetting: protectedProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(({ input, ctx }) => upsertSetting(input.key, input.value, ctx.user?.id)),

  // ─── USER MANAGEMENT ────────────────────────────────────────────────────────
  getUsers: protectedProcedure.query(() => getAllUsers()),

  updateUserRole: protectedProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["owner", "supervisor", "staff", "admin", "user"]) }))
    .mutation(({ input }) => updateUserRole(input.userId, input.role)),
});
