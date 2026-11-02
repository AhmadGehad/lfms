// Hand-written, unlike drizzle/schema.ts (generated from the frozen MySQL
// schema). These tables were born on Postgres: the DDL lives in
// drizzle/pg/post-cutover/0002_worker_tasks.sql, this file gives them types.
import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import {
  BLOCKED_REASONS,
  PURCHASE_KINDS,
  REPORT_TYPES,
  TASK_SOURCES,
  TASK_STATUSES,
  type StockKind,
} from "../shared/tasks";

export const workers = pgTable("saas_azal_workers", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: integer("companyId").notNull(),
  farmId: integer("farmId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  /** Written only by the short-lived Admin link. Nothing reads them; kept until dropped on purpose. */
  userId: integer("userId"),
  loginGone: boolean("loginGone").default(false).notNull(),
  photoKey: varchar("photoKey", { length: 500 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { precision: 0 }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).defaultNow().notNull(),
  createdBy: integer("createdBy"),
  version: integer("version").default(1).notNull(),
});

export const taskTemplates = pgTable("saas_azal_task_templates", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: integer("companyId").notNull(),
  farmId: integer("farmId").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  notes: text("notes"),
  /** Bit 0 is Sunday, bit 6 is Saturday. */
  weekdays: smallint("weekdays").default(127).notNull(),
  assignedWorkerId: integer("assignedWorkerId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { precision: 0 }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).defaultNow().notNull(),
  createdBy: integer("createdBy"),
  deletedAt: timestamp("deletedAt", { precision: 0 }),
  deletedBy: integer("deletedBy"),
  version: integer("version").default(1).notNull(),
});

export const tasks = pgTable("saas_azal_tasks", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: integer("companyId").notNull(),
  farmId: integer("farmId").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  notes: text("notes"),
  animalId: integer("animalId"),
  /** Null means anyone can do it. */
  assignedWorkerId: integer("assignedWorkerId"),
  dueDate: date("dueDate").notNull(),
  source: varchar("source", { length: 20, enum: TASK_SOURCES }).default("manual").notNull(),
  /** Set on generated rows; the unique index is what stops them duplicating. */
  sourceKey: varchar("sourceKey", { length: 100 }),
  status: varchar("status", { length: 20, enum: TASK_STATUSES }).default("todo").notNull(),
  startedByWorkerId: integer("startedByWorkerId"),
  startedAt: timestamp("startedAt", { precision: 0 }),
  finishedByWorkerId: integer("finishedByWorkerId"),
  finishedAt: timestamp("finishedAt", { precision: 0 }),
  blockedReason: varchar("blockedReason", { length: 20, enum: BLOCKED_REASONS }),
  createdAt: timestamp("createdAt", { precision: 0 }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).defaultNow().notNull(),
  createdBy: integer("createdBy"),
  deletedAt: timestamp("deletedAt", { precision: 0 }),
  deletedBy: integer("deletedBy"),
  version: integer("version").default(1).notNull(),
});

/** A worker picking their name on the tablet, with the photo taken then, if the camera allowed it. */
export const workerCheckins = pgTable("saas_azal_worker_checkins", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  companyId: integer("companyId").notNull(),
  farmId: integer("farmId").notNull(),
  workerId: integer("workerId").notNull(),
  reportDate: date("reportDate").notNull(),
  takenAt: timestamp("takenAt", { precision: 0 }).notNull(),
  photoKey: varchar("photoKey", { length: 500 }),
  clientKey: varchar("clientKey", { length: 200 }).notNull(),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt", { precision: 0 }).defaultNow().notNull(),
  deletedAt: timestamp("deletedAt", { precision: 0 }),
});

/** The sign-in behind a farm's tablets, and the one-time code that connects one. */
export const tabletAccounts = pgTable("saas_azal_tablet_accounts", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  companyId: integer("companyId").notNull(),
  farmId: integer("farmId").notNull(),
  userId: integer("userId").notNull(),
  codeHash: varchar("codeHash", { length: 64 }),
  codeExpiresAt: timestamp("codeExpiresAt", { precision: 0 }),
  connectedAt: timestamp("connectedAt", { precision: 0 }),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt", { precision: 0 }).defaultNow().notNull(),
});

/** A note from the tablet to the owner. Changes no record until the owner acts on it. */
export const farmReports = pgTable("saas_azal_farm_reports", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  publicId: varchar("publicId", { length: 26 }).notNull().unique(),
  companyId: integer("companyId").notNull(),
  farmId: integer("farmId").notNull(),
  reportDate: date("reportDate").notNull(),
  type: varchar("type", { length: 20, enum: REPORT_TYPES }).notNull(),
  workerId: integer("workerId").notNull(),
  answer: boolean("answer"),
  /** As typed: the worker may misread a tag, so it isn't a link to an animal. */
  animalTag: varchar("animalTag", { length: 40 }),
  stockKinds: text("stockKinds").array().$type<StockKind[]>(),
  purchaseKind: varchar("purchaseKind", { length: 20, enum: PURCHASE_KINDS }),
  itemName: varchar("itemName", { length: 120 }),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  /** Set when the owner confirms a reported death, which is what exits the animal. */
  animalId: integer("animalId"),
  confirmedAt: timestamp("confirmedAt", { precision: 0 }),
  confirmedBy: integer("confirmedBy"),
  createdAt: timestamp("createdAt", { precision: 0 }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).defaultNow().notNull(),
  createdBy: integer("createdBy"),
  deletedAt: timestamp("deletedAt", { precision: 0 }),
  deletedBy: integer("deletedBy"),
  version: integer("version").default(1).notNull(),
});

/** A device that asked for push notifications. Sent to only while its user is a recipient. */
export const pushSubscriptions = pgTable("saas_azal_push_subscriptions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  companyId: integer("companyId").notNull(),
  userId: integer("userId").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: varchar("p256dh", { length: 200 }).notNull(),
  auth: varchar("auth", { length: 100 }).notNull(),
  /** The language to write this device's notifications in. */
  language: varchar("language", { length: 5 }).default("en").notNull(),
  createdAt: timestamp("createdAt", { precision: 0 }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).defaultNow().notNull(),
});
