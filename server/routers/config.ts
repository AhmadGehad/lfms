import { protectedProcedure, staffProcedure, supervisorProcedure, privilegedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { storageGetSignedUrl, storagePut } from "../storage";
import {
  getAllSpecies, createSpecies, updateSpecies,
  getAllCategories, createCategory, updateCategory,
  getAllStatuses, createStatus, updateStatus,
  getAllGroups, createGroup, updateGroup,
  getAllOwners, createOwner, updateOwner, deleteOwner,
  getAllBirthTypes, createBirthType, updateBirthType,
  getAllFeedItems, createFeedItem, updateFeedItem,
  getFeedItemPriceHistory, addFeedItemPrice, getAllFeedItemPrices, updateFeedItemPrice, deleteFeedItemPrice,
  getAllExpenseCategories, createExpenseCategory, updateExpenseCategory,
  getAllExpenseSubCategories, createExpenseSubCategory, updateExpenseSubCategory,
  getAllSettings, getSetting, upsertSetting,
  getAllUsers, updateUserRole,
  createAuditEntry,
  getVaccines, addVaccine, updateVaccine, deleteVaccine,
} from "../db";

const FARM_MAP_IMAGE_KEY_SETTING = "farmMapImageKey";
const MAX_FARM_MAP_BYTES = 8 * 1024 * 1024;
const MAX_FARM_MAP_DATA_URL_LENGTH = Math.ceil((MAX_FARM_MAP_BYTES * 4) / 3) + 128;

const mapPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const mapShapeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rect"),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
    .refine((shape) => shape.width > 0 && shape.height > 0, "Rectangle needs area")
    .refine((shape) => shape.x + shape.width <= 1 && shape.y + shape.height <= 1, "Rectangle must fit inside map"),
  z.object({
    type: z.literal("polygon"),
    points: z.array(mapPointSchema).min(3).max(80),
  }),
]);

export const configRouter = router({
  // ─── SPECIES ────────────────────────────────────────────────────────────────
  getSpecies: protectedProcedure.query(() => getAllSpecies()),

  createSpecies: supervisorProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createSpecies(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "species", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateSpecies: supervisorProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateSpecies(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "species", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── CATEGORIES ─────────────────────────────────────────────────────────────
  getCategories: protectedProcedure
    .input(z.object({ speciesId: z.number().optional() }).optional())
    .query(({ input }) => getAllCategories(input?.speciesId)),

  createCategory: supervisorProcedure
    .input(z.object({
      name: z.string().min(1),
      speciesId: z.number(),
      idPrefix: z.string().min(1),
      targetWeightKg: z.string().optional(),
      expectedCycleDays: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await createCategory(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "category", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateCategory: supervisorProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      idPrefix: z.string().optional(),
      targetWeightKg: z.string().optional(),
      expectedCycleDays: z.number().optional(),
      autoStageWeightKg: z.string().nullable().optional(),
      autoStageTargetCategoryId: z.number().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateCategory(id, data as any);
      await createAuditEntry({ userId: ctx.user.id, entityType: "category", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── STATUSES ───────────────────────────────────────────────────────────────
  getStatuses: protectedProcedure.query(() => getAllStatuses()),

  createStatus: supervisorProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional(), isExitStatus: z.boolean().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createStatus(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "status", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateStatus: supervisorProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isExitStatus: z.boolean().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateStatus(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "status", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── GROUPS ─────────────────────────────────────────────────────────────────
  getGroups: protectedProcedure
    .input(z.object({ speciesId: z.number().optional() }).optional())
    .query(({ input }) => getAllGroups(input?.speciesId)),

  createGroup: supervisorProcedure
    .input(z.object({
      groupCode: z.string().min(1),
      name: z.string().min(1),
      speciesId: z.number().optional(),
      categoryId: z.number().optional(),
      description: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      mapShape: mapShapeSchema.nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await createGroup(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "group", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateGroup: supervisorProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      groupCode: z.string().optional(),
      speciesId: z.number().optional(),
      categoryId: z.number().optional(),
      description: z.string().optional(),
      latitude: z.string().nullable().optional(),
      longitude: z.string().nullable().optional(),
      mapShape: mapShapeSchema.nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateGroup(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "group", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── OWNERS ─────────────────────────────────────────────────────────────────
  getOwners: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(({ input }) => getAllOwners(input?.activeOnly ?? true)),

  createOwner: staffProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      phone: z.string().max(30).optional(),
      email: z.string().max(100).email().optional().or(z.literal("")),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await createOwner({ ...input, email: input.email || undefined });
      await createAuditEntry({ userId: ctx.user.id, entityType: "owner", entityId: String((result as any).insertId), action: "create", newValues: input as any, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateOwner: staffProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100).optional(),
      phone: z.string().max(30).nullable().optional(),
      email: z.string().max(100).optional(),
      notes: z.string().max(2000).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const before = (await getAllOwners(false)).find((o: any) => o.id === id);
      await updateOwner(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "owner", entityId: String(id), action: "update", oldValues: before as any, newValues: data as any, ipAddress: getClientIp(ctx) });
      return { success: true };
    }),

  deleteOwner: supervisorProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteOwner(input.id, ctx.user?.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "owner", entityId: String(input.id), action: "delete", ipAddress: getClientIp(ctx) });
      return { success: true };
    }),

  // ─── BIRTH TYPES ────────────────────────────────────────────────────────────
  getBirthTypes: protectedProcedure.query(() => getAllBirthTypes()),

  createBirthType: supervisorProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createBirthType(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "birthType", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateBirthType: supervisorProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateBirthType(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "birthType", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── FEED ITEMS ─────────────────────────────────────────────────────────────
  getFeedItems: protectedProcedure.query(() => getAllFeedItems()),

  createFeedItem: supervisorProcedure
    .input(z.object({
      name: z.string().min(1),
      unit: z.string().optional(),
      initialPrice: z.string().optional(),
      priceEffectiveDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await createFeedItem(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "feedItem", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateFeedItem: supervisorProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), unit: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateFeedItem(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "feedItem", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  getFeedItemPriceHistory: protectedProcedure
    .input(z.object({ feedItemId: z.number() }))
    .query(({ input }) => getFeedItemPriceHistory(input.feedItemId)),

  addFeedItemPrice: supervisorProcedure
    .input(z.object({
      feedItemId: z.number(),
      effectiveDate: z.string(),
      pricePerUnit: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await addFeedItemPrice(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "feedItemPrice", entityId: String(input.feedItemId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  getAllFeedItemPrices: protectedProcedure.query(() => getAllFeedItemPrices()),

  updateFeedItemPrice: supervisorProcedure
    .input(z.object({
      id: z.number(),
      effectiveDate: z.string().optional(),
      pricePerUnit: z.string().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      await updateFeedItemPrice(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "feedItemPrice", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return { id };
    }),

  deleteFeedItemPrice: supervisorProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteFeedItemPrice(input.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "feedItemPrice", entityId: String(input.id), action: "delete", newValues: input, ipAddress: getClientIp(ctx) });
      return { id: input.id };
    }),

  // ─── EXPENSE CATEGORIES ─────────────────────────────────────────────────────
  getExpenseCategories: protectedProcedure.query(() => getAllExpenseCategories()),

  createExpenseCategory: supervisorProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createExpenseCategory(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "expenseCategory", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateExpenseCategory: supervisorProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateExpenseCategory(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "expenseCategory", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  getExpenseSubCategories: protectedProcedure
    .input(z.object({ categoryId: z.number().optional() }).optional())
    .query(({ input }) => getAllExpenseSubCategories(input?.categoryId)),

  createExpenseSubCategory: supervisorProcedure
    .input(z.object({ categoryId: z.number(), name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createExpenseSubCategory(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "expenseSubCategory", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateExpenseSubCategory: supervisorProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateExpenseSubCategory(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "expenseSubCategory", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── SETTINGS ───────────────────────────────────────────────────────────────
  getSettings: protectedProcedure.query(() => getAllSettings()),

  getFarmMapImage: protectedProcedure.query(async () => {
    const key = await getSetting(FARM_MAP_IMAGE_KEY_SETTING);
    if (!key) return { key: null, url: null };
    try {
      const url = await storageGetSignedUrl(key);
      return { key, url };
    } catch {
      return { key, url: null };
    }
  }),

  setFarmMapImage: supervisorProcedure
    .input(z.object({
      dataUrl: z
        .string()
        .max(MAX_FARM_MAP_DATA_URL_LENGTH, "Image too large (max 8MB)")
        .refine((s) => /^data:image\/(jpeg|jpg|png|webp);base64,/.test(s), "Must be a JPEG, PNG, or WebP data URL"),
    }))
    .mutation(async ({ input, ctx }) => {
      const match = input.dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image data" });

      const contentType = match[1];
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length > MAX_FARM_MAP_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Image too large (max 8MB)" });
      }

      const ext = contentType.split("/")[1].replace("jpeg", "jpg");
      const { key } = await storagePut(`farm-map/farm-map.${ext}`, buffer, contentType);
      await upsertSetting(FARM_MAP_IMAGE_KEY_SETTING, key, ctx.user?.id);
      await createAuditEntry({
        userId: ctx.user.id,
        entityType: "setting",
        entityId: FARM_MAP_IMAGE_KEY_SETTING,
        action: "update",
        newValues: { key },
        ipAddress: getClientIp(ctx),
      });
      return { success: true, key };
    }),

  removeFarmMapImage: supervisorProcedure.mutation(async ({ ctx }) => {
    await upsertSetting(FARM_MAP_IMAGE_KEY_SETTING, "", ctx.user?.id);
    await createAuditEntry({
      userId: ctx.user.id,
      entityType: "setting",
      entityId: FARM_MAP_IMAGE_KEY_SETTING,
      action: "update",
      newValues: { key: null },
      ipAddress: getClientIp(ctx),
    });
    return { success: true };
  }),

  upsertSetting: supervisorProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await upsertSetting(input.key, input.value, ctx.user?.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "setting", entityId: input.key, action: "update", newValues: { value: input.value }, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── USER MANAGEMENT ────────────────────────────────────────────────────────
  getUsers: protectedProcedure.query(() => getAllUsers()),

  updateUserRole: privilegedProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["owner", "supervisor", "staff", "admin", "user"]) }))
    .mutation(async ({ input, ctx }) => {
      const before = (await getAllUsers()).find((u: any) => u.id === input.userId);
      const result = await updateUserRole(input.userId, input.role);
      await createAuditEntry({ userId: ctx.user.id, entityType: "user", entityId: String(input.userId), action: "update", oldValues: before ? { role: before.role } as any : undefined, newValues: { role: input.role }, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── VACCINES ────────────────────────────────────────────────────────────────
  getVaccines: protectedProcedure.query(() => getVaccines()),

  createVaccine: supervisorProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      validityPeriod: z.number().min(1),
      validityUnit: z.enum(["days", "months"]),
      boosterRequired: z.boolean(),
      boosterInterval: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await addVaccine(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccine", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateVaccine: supervisorProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      validityPeriod: z.number().optional(),
      validityUnit: z.enum(["days", "months"]).optional(),
      boosterRequired: z.boolean().optional(),
      boosterInterval: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      await updateVaccine(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccine", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return { id };
    }),

  deleteVaccine: supervisorProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteVaccine(input.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccine", entityId: String(input.id), action: "delete", ipAddress: getClientIp(ctx) });
      return { id: input.id };
    }),
});
