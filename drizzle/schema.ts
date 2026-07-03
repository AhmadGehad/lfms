import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  date,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─── USERS ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["owner", "supervisor", "staff", "admin", "user", "viewer"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── PER-USER SETTINGS ─────────────────────────────────────────────────────────
// Durable per-user preferences (design version, theme, saved views, density…).
// Key/value so new prefs need no migration. `companyId` is nullable today and
// becomes the tenant scope when multi-farm SaaS lands (docs/TENANCY_DESIGN.md).
export const userSettings = mysqlTable("user_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  companyId: int("companyId"),
  settingKey: varchar("settingKey", { length: 100 }).notNull(),
  settingValue: text("settingValue").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userKeyUnique: uniqueIndex("user_settings_user_key_unique").on(table.userId, table.settingKey),
}));

export type UserSetting = typeof userSettings.$inferSelect;
export type InsertUserSetting = typeof userSettings.$inferInsert;

// ─── ROLE PERMISSIONS ────────────────────────────────────────────────────────
// Rows are explicit overrides. Missing rows fall back to the legacy role
// hierarchy defined in shared/permissions.ts.
export const rolePermissions = mysqlTable("role_permissions", {
  id: int("id").autoincrement().primaryKey(),
  role: mysqlEnum("role", ["owner", "supervisor", "staff", "admin", "user", "viewer"]).notNull(),
  page: varchar("page", { length: 64 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  allowed: boolean("allowed").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: int("updatedBy"),
}, table => ({
  rolePageActionUnique: uniqueIndex("role_permissions_role_page_action_unique")
    .on(table.role, table.page, table.action),
}));

export type RolePermission = typeof rolePermissions.$inferSelect;

// ─── CONFIGURATION TABLES ─────────────────────────────────────────────────────

export const species = mysqlTable("species", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  // Average gestation length in days for this species, used to compute a
  // pregnancy's expected delivery date (confirmationDate + gestationDays).
  gestationDays: int("gestationDays").default(150).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

export const animalCategories = mysqlTable("animal_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  speciesId: int("speciesId").notNull(),
  idPrefix: varchar("idPrefix", { length: 10 }).notNull(),
  idSequence: int("idSequence").default(0).notNull(),
  lambIdSequence: int("lambIdSequence").default(0).notNull(),
  targetWeightKg: decimal("targetWeightKg", { precision: 8, scale: 2 }),
  expectedCycleDays: int("expectedCycleDays"),
  autoStageWeightKg: decimal("autoStageWeightKg", { precision: 8, scale: 2 }),
  autoStageTargetCategoryId: int("autoStageTargetCategoryId"),
  isExitStatus: boolean("isExitStatus").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

export const animalStatuses = mysqlTable("animal_statuses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  isExitStatus: boolean("isExitStatus").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

export const groups = mysqlTable("groups", {
  id: int("id").autoincrement().primaryKey(),
  groupCode: varchar("groupCode", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  speciesId: int("speciesId"),
  categoryId: int("categoryId"),
  description: text("description"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  mapShape: json("mapShape"),
  color: varchar("color", { length: 20 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

// ─── OWNERS ───────────────────────────────────────────────────────────────────
// People (or entities) who own one or more animals on the farm. Animals link
// to an owner via animals.ownerId. Used to filter the animal registry,
// expenses, sales, and P&L by owner.
export const owners = mysqlTable("owners", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 100 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

export const birthTypes = mysqlTable("birth_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

export const feedItems = mysqlTable("feed_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  unit: varchar("unit", { length: 20 }).notNull().default("kg"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
}, table => ({
  deletedNameIdx: index("feed_items_deleted_name_idx").on(table.deletedAt, table.name),
}));

export const feedItemPriceHistory = mysqlTable("feed_item_price_history", {
  id: int("id").autoincrement().primaryKey(),
  feedItemId: int("feedItemId").notNull(),
  effectiveDate: date("effectiveDate").notNull(),
  pricePerUnit: decimal("pricePerUnit", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
}, table => ({
  itemDateIdIdx: index("feed_item_price_history_item_date_id_idx").on(table.feedItemId, table.effectiveDate, table.id),
}));

export const vaccines = mysqlTable("vaccines", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  validityPeriod: int("validityPeriod").notNull(),
  validityUnit: mysqlEnum("validityUnit", ["days", "months"]).default("days").notNull(),
  boosterRequired: boolean("boosterRequired").default(false).notNull(),
  boosterInterval: int("boosterInterval"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

export const vaccinationRecords = mysqlTable("vaccination_records", {
  id: int("id").autoincrement().primaryKey(),
  animalId: int("animalId").notNull(),
  vaccineId: int("vaccineId").notNull(),
  vaccinationDate: date("vaccinationDate").notNull(),
  nextDueDate: date("nextDueDate"),
  boosterDueDate: date("boosterDueDate"),
  notifyBeforeNext: int("notifyBeforeNext").default(7),
  notifyBeforeBooster: int("notifyBeforeBooster").default(7),
  batchNumber: varchar("batchNumber", { length: 50 }),
  notes: text("notes"),
  veterinarian: varchar("veterinarian", { length: 100 }),
  isCompleted: boolean("isCompleted").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

export const expenseCategories = mysqlTable("expense_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

export const expenseSubCategories = mysqlTable("expense_sub_categories", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
});

export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 100 }).notNull().unique(),
  settingValue: text("settingValue").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: int("updatedBy"),
});

// ─── ANIMAL REGISTRY ──────────────────────────────────────────────────────────

export const animals = mysqlTable("animals", {
  id: int("id").autoincrement().primaryKey(),
  animalId: varchar("animalId", { length: 20 }).notNull().unique(),
  speciesId: int("speciesId").notNull(),
  categoryId: int("categoryId").notNull(),
  groupId: int("groupId").notNull(),
  statusId: int("statusId").notNull(),
  sex: mysqlEnum("sex", ["male", "female"]).notNull(),
  acquisitionType: mysqlEnum("acquisitionType", ["purchased", "born"]).notNull(),
  acquisitionDate: date("acquisitionDate").notNull(),
  birthDate: date("birthDate").notNull(),
  damId: int("damId"),
  sireId: int("sireId"),
  ownerId: int("ownerId"),
  photoUrl: varchar("photoUrl", { length: 500 }),
  purchaseCost: decimal("purchaseCost", { precision: 10, scale: 2 }).default("0"),
  weightAtAcquisition: decimal("weightAtAcquisition", { precision: 8, scale: 2 }),
  exitDate: date("exitDate"),
  exitReason: text("exitReason"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

export const animalStatusHistory = mysqlTable("animal_status_history", {
  id: int("id").autoincrement().primaryKey(),
  animalId: int("animalId").notNull(),
  previousStatusId: int("previousStatusId"),
  newStatusId: int("newStatusId").notNull(),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
  changedBy: int("changedBy"),
  notes: text("notes"),
});

// ─── SALES ────────────────────────────────────────────────────────────────────

export const sales = mysqlTable("sales", {
  id: int("id").autoincrement().primaryKey(),
  animalId: int("animalId").notNull(),
  saleDate: date("saleDate").notNull(),
  salePrice: decimal("salePrice", { precision: 10, scale: 2 }).notNull(),
  amountPaid: decimal("amountPaid", { precision: 10, scale: 2 }).default("0").notNull(),
  weightAtSale: decimal("weightAtSale", { precision: 8, scale: 2 }),
  pricePerKg: decimal("pricePerKg", { precision: 10, scale: 2 }),
  buyerName: varchar("buyerName", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

// ─── BREEDING & LAMBING ───────────────────────────────────────────────────────

export const lambingLog = mysqlTable("lambing_log", {
  id: int("id").autoincrement().primaryKey(),
  lambId: varchar("lambId", { length: 20 }).notNull().unique(),
  speciesId: int("speciesId"),
  categoryId: int("categoryId"),
  birthDate: date("birthDate").notNull(),
  damId: int("damId"),
  sireId: int("sireId"),
  sex: mysqlEnum("sex", ["male", "female"]).notNull(),
  birthTypeId: int("birthTypeId").notNull(),
  birthWeightKg: decimal("birthWeightKg", { precision: 8, scale: 2 }),
  valueUsed: decimal("valueUsed", { precision: 10, scale: 2 }),
  groupId: int("groupId"),
  notes: text("notes"),
  isPromoted: boolean("isPromoted").default(false).notNull(),
  promotedHeadId: int("promotedHeadId"),
  promotedAnimalCode: varchar("promotedAnimalCode", { length: 20 }),
  promotedAnimalPurgedAt: timestamp("promotedAnimalPurgedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
}, table => ({
  promotedHeadUnique: uniqueIndex("lambing_log_promoted_head_unique")
    .on(table.promotedHeadId),
}));

// ─── FATTENING / WEIGHT LOG ───────────────────────────────────────────────────

export const weightLog = mysqlTable("weight_log", {
  id: int("id").autoincrement().primaryKey(),
  animalId: int("animalId").notNull(),
  weighDate: date("weighDate").notNull(),
  weightKg: decimal("weightKg", { precision: 8, scale: 2 }).notNull(),
  sessionId: varchar("sessionId", { length: 36 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

// ─── FEED MANAGEMENT ──────────────────────────────────────────────────────────

export const rationPlans = mysqlTable("ration_plans", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(),
  feedItemId: int("feedItemId").notNull(),
  qtyPerHeadPerDay: decimal("qtyPerHeadPerDay", { precision: 8, scale: 3 }).notNull(),
  effectiveDate: date("effectiveDate").notNull(),
  endDate: date("endDate"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

export const feedStockLedger = mysqlTable("feed_stock_ledger", {
  id: int("id").autoincrement().primaryKey(),
  feedItemId: int("feedItemId").notNull(),
  transactionDate: date("transactionDate").notNull(),
  transactionType: mysqlEnum("transactionType", ["purchase", "stock_count", "adjustment"]).notNull(),
  qty: decimal("qty", { precision: 10, scale: 3 }).notNull(),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }),
  totalCost: decimal("totalCost", { precision: 10, scale: 2 }),
  supplierName: varchar("supplierName", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

// ─── EXPENSE LOG ──────────────────────────────────────────────────────────────

export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  expenseDate: date("expenseDate").notNull(),
  categoryId: int("categoryId").notNull(),
  subCategoryId: int("subCategoryId"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  targetType: mysqlEnum("targetType", ["general", "category", "head", "herd"]).notNull(),
  categoryTarget: int("categoryTarget"),
  headId: int("headId"),
  vendorName: varchar("vendorName", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

// ─── PREGNANCY TRACKING ───────────────────────────────────────────────────────
// One record per pregnancy of a female animal. The user records a confirmation
// date; the system treats it as gestation day 0 and computes the expected
// delivery date as confirmationDate + gestationDays (snapshotted from the
// animal's species at creation, so historical records stay stable). Closed
// automatically when a birth is registered against the dam.
export const pregnancyRecords = mysqlTable("pregnancy_records", {
  id: int("id").autoincrement().primaryKey(),
  animalId: int("animalId").notNull(),
  sireId: int("sireId"),
  confirmationDate: date("confirmationDate").notNull(),
  gestationDays: int("gestationDays").notNull(),
  expectedDueDate: date("expectedDueDate").notNull(),
  notifyBeforeDue: int("notifyBeforeDue").default(7).notNull(),
  checkupDate: date("checkupDate"),
  notifyBeforeCheckup: int("notifyBeforeCheckup").default(3).notNull(),
  status: mysqlEnum("status", ["active", "delivered", "aborted", "lost"]).default("active").notNull(),
  outcomeLambingLogId: int("outcomeLambingLogId"),
  completedDate: date("completedDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  alertType: varchar("alertType", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  relatedEntityType: varchar("relatedEntityType", { length: 50 }),
  relatedEntityId: varchar("relatedEntityId", { length: 50 }),
  isRead: boolean("isRead").default(false).notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  action: varchar("action", { length: 50 }).notNull(),
  entityType: varchar("entityType", { length: 50 }).notNull(),
  entityId: varchar("entityId", { length: 50 }),
  oldValues: json("oldValues"),
  newValues: json("newValues"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Revert tracking: when this action was undone, by whom, and (on a "revert"
  // entry) which original audit row it undoes.
  revertedAt: timestamp("revertedAt"),
  revertedByUserId: int("revertedByUserId"),
  revertOfAuditId: int("revertOfAuditId"),
});

// ─── TYPE EXPORTS ─────────────────────────────────────────────────────────────

export type Species = typeof species.$inferSelect;
export type AnimalCategory = typeof animalCategories.$inferSelect;
export type AnimalStatus = typeof animalStatuses.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Owner = typeof owners.$inferSelect;
export type InsertOwner = typeof owners.$inferInsert;
export type BirthType = typeof birthTypes.$inferSelect;
export type FeedItem = typeof feedItems.$inferSelect;
export type FeedItemPriceHistory = typeof feedItemPriceHistory.$inferSelect;
export type Vaccine = typeof vaccines.$inferSelect;
export type VaccinationRecord = typeof vaccinationRecords.$inferSelect;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type ExpenseSubCategory = typeof expenseSubCategories.$inferSelect;
export type Animal = typeof animals.$inferSelect;
export type AnimalStatusHistory = typeof animalStatusHistory.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type LambingLog = typeof lambingLog.$inferSelect;
export type WeightLog = typeof weightLog.$inferSelect;
export type RationPlan = typeof rationPlans.$inferSelect;
export type FeedStockLedger = typeof feedStockLedger.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type PregnancyRecord = typeof pregnancyRecords.$inferSelect;
export type InsertPregnancyRecord = typeof pregnancyRecords.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
