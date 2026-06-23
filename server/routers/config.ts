import {
  anyPermissionProcedure,
  permissionProcedure,
  router,
} from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { MAX_MAP_POLYGON_POINTS } from "@shared/const";
import { z } from "zod";
import { getClientIp } from "../_core/audit";
import { storageGetSignedUrl, storagePut } from "../storage";
import {
  getAllSpecies, createSpecies, updateSpecies,
  getAllCategories, createCategory, updateCategory,
  categoryHasAnimals, getCategoryForUpdate, getDb,
  getAllStatuses, createStatus, updateStatus,
  getAllGroups, createGroup, updateGroup,
  getAllOwners, createOwner, updateOwner, deleteOwner,
  getAllBirthTypes, createBirthType, updateBirthType,
  getAllFeedItems, createFeedItem, updateFeedItem,
  getFeedItemPriceHistory, addFeedItemPrice, getAllFeedItemPrices, updateFeedItemPrice, deleteFeedItemPrice,
  getAllExpenseCategories, createExpenseCategory, updateExpenseCategory,
  getAllExpenseSubCategories, createExpenseSubCategory, updateExpenseSubCategory,
  getAllSettings, getSetting, upsertSetting,
  createAuditEntry,
  getVaccines, addVaccine, updateVaccine, deleteVaccine,
} from "../db";

const FARM_MAP_IMAGE_KEY_SETTING = "farmMapImageKey";
const MAX_FARM_MAP_BYTES = 8 * 1024 * 1024;
const MAX_FARM_MAP_DATA_URL_LENGTH = Math.ceil((MAX_FARM_MAP_BYTES * 4) / 3) + 128;
const REFERENCE_VIEW_PERMISSIONS = [
  ["dashboard", "view"],
  ["animals", "view"],
  ["breeding", "view"],
  ["pregnancy", "view"],
  ["fattening", "view"],
  ["feed", "view"],
  ["vaccinations", "view"],
  ["expenses", "view"],
  ["pnl", "view"],
  ["incomeStatement", "view"],
  ["sales", "view"],
  ["configuration", "view"],
  ["farmMap", "view"],
] as const;
const OWNER_VIEW_PERMISSIONS = [
  ["animals", "view"],
  ["pregnancy", "view"],
  ["expenses", "view"],
  ["pnl", "view"],
  ["incomeStatement", "view"],
  ["sales", "view"],
  ["configuration", "view"],
] as const;

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
    points: z.array(mapPointSchema).min(3).max(MAX_MAP_POLYGON_POINTS),
  }),
]);

export const configRouter = router({
  // ─── SPECIES ────────────────────────────────────────────────────────────────
  getSpecies: anyPermissionProcedure(REFERENCE_VIEW_PERMISSIONS).query(() => getAllSpecies()),

  createSpecies: permissionProcedure("configuration", "create")
    .input(z.object({ name: z.string().min(1), description: z.string().optional(), gestationDays: z.number().int().min(1).max(1000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createSpecies(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "species", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateSpecies: permissionProcedure("configuration", "update")
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional(), gestationDays: z.number().int().min(1).max(1000).optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateSpecies(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "species", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── CATEGORIES ─────────────────────────────────────────────────────────────
  getCategories: anyPermissionProcedure(REFERENCE_VIEW_PERMISSIONS)
    .input(z.object({ speciesId: z.number().optional() }).optional())
    .query(({ input }) => getAllCategories(input?.speciesId)),

  createCategory: permissionProcedure("configuration", "create")
    .input(z.object({
      name: z.string().min(1),
      speciesId: z.number(),
      idPrefix: z.string().trim().min(1).max(10),
      targetWeightKg: z.string().optional(),
      expectedCycleDays: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await createCategory(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "category", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateCategory: permissionProcedure("configuration", "update")
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      idPrefix: z.string().trim().min(1).max(10).optional(),
      targetWeightKg: z.string().optional(),
      expectedCycleDays: z.number().optional(),
      autoStageWeightKg: z.string().nullable().optional(),
      autoStageTargetCategoryId: z.number().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }
      return db.transaction(async (tx) => {
        const current = await getCategoryForUpdate(id, tx);
        if (!current || current.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
        }
        if (data.idPrefix &&
            data.idPrefix !== current.idPrefix &&
            await categoryHasAnimals(id, tx)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Category prefix cannot change after animal or birth IDs have been assigned",
          });
        }
        const result = await updateCategory(id, data as any, tx);
        await createAuditEntry({
          userId: ctx.user.id,
          entityType: "category",
          entityId: String(id),
          action: "update",
          oldValues: current as any,
          newValues: data,
          ipAddress: getClientIp(ctx),
        }, tx);
        return result;
      });
    }),

  // ─── STATUSES ───────────────────────────────────────────────────────────────
  getStatuses: anyPermissionProcedure(REFERENCE_VIEW_PERMISSIONS).query(() => getAllStatuses()),

  createStatus: permissionProcedure("configuration", "create")
    .input(z.object({ name: z.string().min(1), description: z.string().optional(), isExitStatus: z.boolean().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createStatus(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "status", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateStatus: permissionProcedure("configuration", "update")
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isExitStatus: z.boolean().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateStatus(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "status", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── GROUPS ─────────────────────────────────────────────────────────────────
  getGroups: anyPermissionProcedure(REFERENCE_VIEW_PERMISSIONS)
    .input(z.object({ speciesId: z.number().optional() }).optional())
    .query(({ input }) => getAllGroups(input?.speciesId)),

  createGroup: permissionProcedure("configuration", "create")
    .input(z.object({
      groupCode: z.string().min(1),
      name: z.string().min(1),
      speciesId: z.number().optional(),
      categoryId: z.number().optional(),
      description: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      mapShape: mapShapeSchema.nullable().optional(),
      color: z.string().max(20).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await createGroup(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "group", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateGroup: permissionProcedure("configuration", "update")
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
      color: z.string().max(20).nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateGroup(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "group", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateGroupMap: permissionProcedure("farmMap", "update")
    .input(z.object({
      id: z.number(),
      mapShape: mapShapeSchema.nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await updateGroup(input.id, { mapShape: input.mapShape });
      await createAuditEntry({
        userId: ctx.user.id,
        entityType: "group",
        entityId: String(input.id),
        action: "update",
        newValues: { mapShape: input.mapShape },
        ipAddress: getClientIp(ctx),
      });
      return result;
    }),

  // ─── OWNERS ─────────────────────────────────────────────────────────────────
  getOwners: permissionProcedure("configuration", "view")
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(({ input }) => getAllOwners(input?.activeOnly ?? true)),

  getOwnerOptions: anyPermissionProcedure(OWNER_VIEW_PERMISSIONS)
    .query(async () => {
      const ownerRows = await getAllOwners(true);
      return ownerRows.map(owner => ({
        id: owner.id,
        name: owner.name,
        isActive: owner.isActive,
      }));
    }),

  createOwner: permissionProcedure("configuration", "create")
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

  updateOwner: permissionProcedure("configuration", "update")
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

  deleteOwner: permissionProcedure("configuration", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteOwner(input.id, ctx.user?.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "owner", entityId: String(input.id), action: "delete", ipAddress: getClientIp(ctx) });
      return { success: true };
    }),

  // ─── BIRTH TYPES ────────────────────────────────────────────────────────────
  getBirthTypes: anyPermissionProcedure([
    ["breeding", "view"],
    ["configuration", "view"],
  ]).query(() => getAllBirthTypes()),

  createBirthType: permissionProcedure("configuration", "create")
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createBirthType(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "birthType", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateBirthType: permissionProcedure("configuration", "update")
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateBirthType(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "birthType", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── FEED ITEMS ─────────────────────────────────────────────────────────────
  getFeedItems: anyPermissionProcedure([
    ["dashboard", "view"],
    ["feed", "view"],
    ["configuration", "view"],
  ]).query(() => getAllFeedItems()),

  createFeedItem: permissionProcedure("configuration", "create")
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

  updateFeedItem: permissionProcedure("configuration", "update")
    .input(z.object({ id: z.number(), name: z.string().optional(), unit: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateFeedItem(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "feedItem", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  getFeedItemPriceHistory: permissionProcedure("feed", "view")
    .input(z.object({ feedItemId: z.number() }))
    .query(({ input }) => getFeedItemPriceHistory(input.feedItemId)),

  addFeedItemPrice: anyPermissionProcedure([
    ["configuration", "create"],
    ["feed", "create"],
  ])
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

  getAllFeedItemPrices: permissionProcedure("feed", "view").query(() => getAllFeedItemPrices()),

  updateFeedItemPrice: anyPermissionProcedure([
    ["configuration", "update"],
    ["feed", "update"],
  ])
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

  deleteFeedItemPrice: anyPermissionProcedure([
    ["configuration", "delete"],
    ["feed", "delete"],
  ])
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteFeedItemPrice(input.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "feedItemPrice", entityId: String(input.id), action: "delete", newValues: input, ipAddress: getClientIp(ctx) });
      return { id: input.id };
    }),

  // ─── EXPENSE CATEGORIES ─────────────────────────────────────────────────────
  getExpenseCategories: anyPermissionProcedure([
    ["expenses", "view"],
    ["configuration", "view"],
  ]).query(() => getAllExpenseCategories()),

  createExpenseCategory: permissionProcedure("configuration", "create")
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createExpenseCategory(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "expenseCategory", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateExpenseCategory: permissionProcedure("configuration", "update")
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateExpenseCategory(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "expenseCategory", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  getExpenseSubCategories: anyPermissionProcedure([
    ["expenses", "view"],
    ["configuration", "view"],
  ])
    .input(z.object({ categoryId: z.number().optional() }).optional())
    .query(({ input }) => getAllExpenseSubCategories(input?.categoryId)),

  createExpenseSubCategory: permissionProcedure("configuration", "create")
    .input(z.object({ categoryId: z.number(), name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await createExpenseSubCategory(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "expenseSubCategory", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateExpenseSubCategory: permissionProcedure("configuration", "update")
    .input(z.object({ id: z.number(), categoryId: z.number().optional(), name: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      const result = await updateExpenseSubCategory(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "expenseSubCategory", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── SETTINGS ───────────────────────────────────────────────────────────────
  getSettings: permissionProcedure("configuration", "view")
    .query(() => getAllSettings()),

  getDisplaySettings: anyPermissionProcedure([
    ["dashboard", "view"],
    ["animals", "view"],
  ]).query(async () => {
    const settings = await getAllSettings();
    return settings.filter(setting =>
      setting.settingKey === "currency" ||
      setting.settingKey === "farmName",
    );
  }),

  getFarmMapImage: anyPermissionProcedure([
    ["animals", "view"],
    ["farmMap", "view"],
  ]).query(async () => {
    const key = await getSetting(FARM_MAP_IMAGE_KEY_SETTING);
    if (!key) return { key: null, url: null };
    try {
      const url = await storageGetSignedUrl(key);
      return { key, url };
    } catch {
      return { key, url: null };
    }
  }),

  setFarmMapImage: permissionProcedure("farmMap", "update")
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

  removeFarmMapImage: permissionProcedure("farmMap", "update").mutation(async ({ ctx }) => {
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

  upsertSetting: permissionProcedure("configuration", "update")
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await upsertSetting(input.key, input.value, ctx.user?.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "setting", entityId: input.key, action: "update", newValues: { value: input.value }, ipAddress: getClientIp(ctx) });
      return result;
    }),

  // ─── VACCINES ────────────────────────────────────────────────────────────────
  getVaccines: anyPermissionProcedure([
    ["dashboard", "view"],
    ["animals", "view"],
    ["vaccinations", "view"],
    ["configuration", "view"],
  ]).query(() => getVaccines()),

  createVaccine: permissionProcedure("configuration", "create")
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      validityPeriod: z.number().min(1),
      validityUnit: z.enum(["days", "months"]),
      boosterRequired: z.boolean(),
      boosterInterval: z.number().optional(),
    }).superRefine((val, ctx) => {
      if (val.boosterRequired && (val.boosterInterval == null || val.boosterInterval < 1)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["boosterInterval"], message: "Booster interval (days) is required when booster is required" });
      }
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await addVaccine(input);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccine", entityId: String((result as any).insertId), action: "create", newValues: input, ipAddress: getClientIp(ctx) });
      return result;
    }),

  updateVaccine: permissionProcedure("configuration", "update")
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      validityPeriod: z.number().optional(),
      validityUnit: z.enum(["days", "months"]).optional(),
      boosterRequired: z.boolean().optional(),
      boosterInterval: z.number().optional(),
      isActive: z.boolean().optional(),
    }).superRefine((val, ctx) => {
      if (val.boosterRequired === true && (val.boosterInterval == null || val.boosterInterval < 1)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["boosterInterval"], message: "Booster interval (days) is required when booster is required" });
      }
    }))
    .mutation(async ({ input: { id, ...data }, ctx }) => {
      await updateVaccine(id, data);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccine", entityId: String(id), action: "update", newValues: data, ipAddress: getClientIp(ctx) });
      return { id };
    }),

  deleteVaccine: permissionProcedure("configuration", "delete")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteVaccine(input.id);
      await createAuditEntry({ userId: ctx.user.id, entityType: "vaccine", entityId: String(input.id), action: "delete", ipAddress: getClientIp(ctx) });
      return { id: input.id };
    }),
});
