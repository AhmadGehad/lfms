import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { animals } from "../../drizzle/schema";
import { farmReports, taskTemplates, tasks, workers } from "../../drizzle/schema.workerTasks";
import {
  ALL_WEEKDAYS,
  ANIMAL_REPORTS,
  BLOCKED_REASONS,
  MAX_REPORT_AMOUNT,
  PURCHASE_KINDS,
  STOCK_KINDS,
  TASK_ACTIONS,
  PHOTO_ACTIONS,
} from "../../shared/tasks";
import { hasPermission } from "../../shared/permissions";
import type { TenantContext } from "../../shared/tenancy";
import { getClientIp } from "../_core/audit";
import { isDuplicateEntryError } from "../_core/databaseErrors";
import { logger } from "../observability/logger";
import { permissionProcedure, router } from "../_core/trpc";
import { isoDate } from "../_core/validators";
import { createAuditEntry, getDb, type DbOrTx } from "../db";
import { sendTaskAlert, type TaskAlert } from "../notifications/fanout";
import { executeIdempotent } from "../platform/idempotency";
import { retireFarmImages, storagePut } from "../storage";
import {
  confirmReportedDeath,
  deleteDayReport,
  farmDate,
  findCheckin,
  getDayReport,
  getOwnerOverview,
  getTabletDay,
  getReportStatus,
  listDayReports,
  listReports,
  listTemplates,
  listWorkers,
  recordCheckin,
  taskPhotoFits,
  recordTaskAction,
  requireAllowedWorker,
  requireFarmId,
  submitFarmReport,
} from "../tasks/service";
import { createTabletCode, disconnectTablets, getTabletStatus } from "../tasks/tablet";
import { generatePublicId } from "../tenancy/publicIds";
import { tenantScope } from "../tenancy/scope";

const title = z.string().trim().min(1).max(200);
const notes = z.string().trim().max(2000).nullable().optional();
const workerName = z.string().trim().min(1).max(80);
const weekdays = z.number().int().min(1).max(ALL_WEEKDAYS);
const assignedWorkerId = z.number().int().positive().nullable().optional();
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const photoDataUrl = z.string()
  .max(Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 40)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, "Must be a JPEG, PNG, or WebP image");
const versioned = { id: z.number().int().positive(), expectedVersion: z.number().int().positive() };

const reportBase = {
  workerId: z.number().int().positive(),
  reportDate: isoDate.nullable().optional(),
  tappedAt: z.string().datetime().nullable().optional(),
  idempotencyKey: z.string().min(8).max(200),
};

const reportInput = z.discriminatedUnion("type", [
  z.object({ ...reportBase, type: z.literal("doctor_visit"), answer: z.boolean() }),
  z.object({
    ...reportBase,
    type: z.literal("stock_needed"),
    answer: z.boolean(),
    stockKinds: z.array(z.enum(STOCK_KINDS)).max(STOCK_KINDS.length).nullable().optional(),
    itemName: z.string().trim().max(120).nullable().optional(),
  }).refine(input => !input.answer || Boolean(input.stockKinds?.length), {
    message: "Say what stock is needed",
    path: ["stockKinds"],
  }).refine(input => !input.answer || !input.stockKinds?.includes("other") || Boolean(input.itemName), {
    message: "Say what stock is needed",
    path: ["itemName"],
  }),
  z.object({ ...reportBase, type: z.enum(ANIMAL_REPORTS), animalTag: z.string().trim().min(1).max(40) }),
  z.object({
    ...reportBase,
    type: z.literal("purchase"),
    purchaseKind: z.enum(PURCHASE_KINDS),
    itemName: z.string().trim().max(120).nullable().optional(),
    amount: z.number().positive().max(MAX_REPORT_AMOUNT),
  }).refine(input => input.purchaseKind !== "other" || Boolean(input.itemName), {
    message: "Say what was bought",
    path: ["itemName"],
  }),
]);

async function requireDb(): Promise<DbOrTx> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

/** With no farm selected a template can be any farm's, so it brings its own farm and clock. */
async function templateInScope(db: DbOrTx, tenant: TenantContext, id: number) {
  const [template] = await db.select({ id: taskTemplates.id, farmId: taskTemplates.farmId, isActive: taskTemplates.isActive })
    .from(taskTemplates)
    .where(and(tenantScope(tenant, taskTemplates), eq(taskTemplates.id, id), isNull(taskTemplates.deletedAt)))
    .limit(1);
  requireUpdated(template ? [template] : [], "Repeating task");
  return template;
}

async function todaysCopyKey(db: DbOrTx, tenant: TenantContext, template: { id: number; farmId: number }) {
  return `template:${template.id}:${await farmDate(db, { ...tenant, selectedFarmId: template.farmId })}`;
}

function requireUpdated(rows: unknown[], what: string) {
  if (rows.length === 0) {
    throw new TRPCError({ code: "CONFLICT", message: `${what} changed since it was loaded. Refresh and try again.` });
  }
}

function duplicateWorkerName(error: unknown) {
  return isDuplicateEntryError(error)
    ? new TRPCError({ code: "CONFLICT", message: "WORKER_NAME_TAKEN" })
    : error;
}

async function assertAnimalInFarm(db: DbOrTx, companyId: number, farmId: number, animalId: number) {
  const [animal] = await db.select({ id: animals.id }).from(animals).where(and(
    eq(animals.companyId, companyId),
    eq(animals.farmId, farmId),
    eq(animals.id, animalId),
    isNull(animals.deletedAt),
  )).limit(1);
  if (!animal) throw new TRPCError({ code: "BAD_REQUEST", message: "Animal not found on this farm" });
}

async function assertWorkerInFarm(db: DbOrTx, companyId: number, farmId: number, workerId: number) {
  const [worker] = await db.select({ id: workers.id }).from(workers).where(and(
    eq(workers.companyId, companyId),
    eq(workers.farmId, farmId),
    eq(workers.id, workerId),
  )).limit(1);
  if (!worker) throw new TRPCError({ code: "BAD_REQUEST", message: "Worker not found on this farm" });
}

async function storePhoto(path: string, dataUrl: string) {
  const [, type, base64] = dataUrl.match(/^data:image\/([a-z]+);base64,(.+)$/)!;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_PHOTO_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "Image too large (max 3MB)" });
  const { key } = await storagePut(`${path}.${type === "jpeg" ? "jpg" : type}`, bytes, `image/${type}`);
  return key;
}

export const tasksRouter = router({
  // ─── TABLET ───────────────────────────────────────────────────────────────
  today: permissionProcedure("workerTasks", "view")
    .query(({ ctx }) => getTabletDay(ctx.tenant!)),

  recordAction: permissionProcedure("workerTasks", "update")
    .input(z.object({
      taskId: z.number().int().positive(),
      action: z.enum(TASK_ACTIONS),
      workerId: z.number().int().positive().nullable().optional(),
      reason: z.enum(BLOCKED_REASONS).nullable().optional(),
      tappedAt: z.string().datetime().nullable().optional(),
      idempotencyKey: z.string().min(8).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const { idempotencyKey, ...data } = input;
      // Filled only when the work really runs, so a replayed request sends nothing twice.
      const alerts: TaskAlert[] = [];
      const result = await db.transaction(tx => executeIdempotent(tx, {
        companyId: ctx.tenant!.companyId,
        userId: ctx.user.id,
        key: idempotencyKey,
        operation: "tasks.recordAction",
        body: data,
      }, () => recordTaskAction(tx, ctx.tenant!, { ...data, ipAddress: getClientIp(ctx) }, alert => alerts.push(alert))));
      alerts.forEach(sendTaskAlert);
      return result;
    }),

  submitReport: permissionProcedure("workerTasks", "update")
    .input(reportInput)
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const { idempotencyKey, ...data } = input;
      const alerts: TaskAlert[] = [];
      const result = await db.transaction(tx => executeIdempotent(tx, {
        companyId: ctx.tenant!.companyId,
        userId: ctx.user.id,
        key: idempotencyKey,
        operation: "tasks.submitReport",
        body: data,
      }, () => submitFarmReport(tx, ctx.tenant!, { ...data, ipAddress: getClientIp(ctx) }, alert => alerts.push(alert))));
      alerts.forEach(sendTaskAlert);
      return result;
    }),

  checkIn: permissionProcedure("workerTasks", "update")
    .input(z.object({
      workerId: z.number().int().positive(),
      photo: photoDataUrl.nullable(),
      takenAt: z.string().datetime().nullable().optional(),
      reportDate: isoDate.nullable().optional(),
      taskId: z.number().int().positive().nullable().optional(),
      taskAction: z.enum(PHOTO_ACTIONS).nullable().optional(),
      idempotencyKey: z.string().min(8).max(200),
    }).refine(input => !input.taskId === !input.taskAction, { message: "A task photo needs both the task and the action" }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenant = ctx.tenant!;
      const already = await findCheckin(tenant, input.idempotencyKey);
      if (already) return { id: already.id };
      await requireAllowedWorker(db, tenant, requireFarmId(tenant), input.workerId, input.takenAt);
      if (input.taskId && input.taskAction && !await taskPhotoFits(tenant, input.taskId, input.taskAction, input.workerId)) {
        return { id: null };
      }
      // A full storage quota mustn't stop anyone working: the report says "no photo".
      const photoKey = input.photo
        ? await storePhoto(`checkins/${input.workerId}`, input.photo).catch(error => {
            logger.warn("tasks.checkin_photo_failed", { error });
            return null;
          })
        : null;
      const row = await recordCheckin(tenant, {
        workerId: input.workerId,
        reportDate: input.reportDate,
        takenAt: input.takenAt,
        photoKey,
        taskId: input.taskId,
        taskAction: input.taskAction,
        clientKey: input.idempotencyKey,
      });
      if (!row && photoKey) await retireFarmImages([photoKey]);
      return { id: row?.id ?? null };
    }),

  // ─── OWNER: DAILY REPORTS ─────────────────────────────────────────────────
  listReports: permissionProcedure("tasks", "view")
    .input(z.object({ from: isoDate.optional(), to: isoDate.optional() }).optional())
    .query(({ input, ctx }) => listReports(ctx.tenant!, input)),

  reportStatus: permissionProcedure("tasks", "view")
    .query(({ ctx }) => getReportStatus(ctx.tenant!)),

  confirmDeath: permissionProcedure("tasks", "update")
    .input(z.object({
      id: z.number().int().positive(),
      animalId: z.number().int().positive(),
      idempotencyKey: z.string().min(8).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      // Takes an animal out of the herd, which animals.exit guards with this.
      if (!hasPermission(ctx.user.role, ctx.permissionOverrides, "sales", "create")) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await requireDb();
      return db.transaction(tx => executeIdempotent(tx, {
        companyId: ctx.tenant!.companyId,
        userId: ctx.user.id,
        key: input.idempotencyKey,
        operation: "tasks.confirmDeath",
        body: { id: input.id, animalId: input.animalId },
      }, () => confirmReportedDeath(tx, ctx.tenant!, { reportId: input.id, animalId: input.animalId, ipAddress: getClientIp(ctx) })));
    }),

  deleteReport: permissionProcedure("tasks", "delete")
    .input(z.object(versioned))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const rows = await db.update(farmReports).set({
        deletedAt: new Date(), deletedBy: ctx.user.id, version: input.expectedVersion + 1,
      }).where(and(
        tenantScope(ctx.tenant!, farmReports),
        eq(farmReports.id, input.id),
        eq(farmReports.version, input.expectedVersion),
        isNull(farmReports.deletedAt),
        // It's the record of why the animal left the herd.
        isNull(farmReports.confirmedAt),
      )).returning({ id: farmReports.id });
      requireUpdated(rows, "Report");
      await createAuditEntry({
        userId: ctx.user.id, entityType: "farmReport", entityId: String(input.id), action: "report_delete", ipAddress: getClientIp(ctx),
      });
      return { success: true };
    }),

  // ─── OWNER: TASKS ─────────────────────────────────────────────────────────
  overview: permissionProcedure("tasks", "view")
    .query(({ ctx }) => getOwnerOverview(ctx.tenant!)),

  create: permissionProcedure("tasks", "create")
    .input(z.object({
      title,
      notes,
      animalId: z.number().int().positive().nullable().optional(),
      assignedWorkerId,
      dueDate: isoDate,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenant = ctx.tenant!;
      const farmId = requireFarmId(tenant);
      if (input.animalId) await assertAnimalInFarm(db, tenant.companyId, farmId, input.animalId);
      if (input.assignedWorkerId) await assertWorkerInFarm(db, tenant.companyId, farmId, input.assignedWorkerId);
      const [row] = await db.insert(tasks).values({
        ...input,
        publicId: generatePublicId(),
        companyId: tenant.companyId,
        farmId,
        source: "manual",
        createdBy: ctx.user.id,
      }).returning({ id: tasks.id });
      await createAuditEntry({
        userId: ctx.user.id,
        entityType: "task",
        entityId: String(row.id),
        action: "create",
        newValues: input as any,
        ipAddress: getClientIp(ctx),
      });
      return row;
    }),

  update: permissionProcedure("tasks", "update")
    .input(z.object({
      ...versioned,
      title,
      notes,
      animalId: z.number().int().positive().nullable().optional(),
      assignedWorkerId,
      dueDate: isoDate,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenant = ctx.tenant!;
      const { id, expectedVersion, ...data } = input;
      const [task] = await db.select({ source: tasks.source, farmId: tasks.farmId }).from(tasks).where(and(
        tenantScope(tenant, tasks), eq(tasks.id, id), isNull(tasks.deletedAt),
      )).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      // A generated task's text comes from its template or vaccination record.
      if (task.source !== "manual") throw new TRPCError({ code: "BAD_REQUEST", message: "Only hand-added tasks can be edited" });
      if (data.animalId) await assertAnimalInFarm(db, tenant.companyId, task.farmId, data.animalId);
      if (data.assignedWorkerId) await assertWorkerInFarm(db, tenant.companyId, task.farmId, data.assignedWorkerId);
      const rows = await db.update(tasks).set({ ...data, version: expectedVersion + 1 }).where(and(
        tenantScope(tenant, tasks), eq(tasks.id, id), eq(tasks.version, expectedVersion), isNull(tasks.deletedAt),
      )).returning({ id: tasks.id });
      requireUpdated(rows, "Task");
      await createAuditEntry({
        userId: ctx.user.id, entityType: "task", entityId: String(id), action: "update",
        newValues: data as any, ipAddress: getClientIp(ctx),
      });
      return { success: true };
    }),

  delete: permissionProcedure("tasks", "delete")
    .input(z.object(versioned))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const rows = await db.update(tasks).set({
        deletedAt: new Date(), deletedBy: ctx.user.id, version: input.expectedVersion + 1,
      }).where(and(
        tenantScope(ctx.tenant!, tasks), eq(tasks.id, input.id), eq(tasks.version, input.expectedVersion), isNull(tasks.deletedAt),
      )).returning({ id: tasks.id });
      requireUpdated(rows, "Task");
      await createAuditEntry({
        userId: ctx.user.id, entityType: "task", entityId: String(input.id), action: "delete", ipAddress: getClientIp(ctx),
      });
      return { success: true };
    }),

  assign: permissionProcedure("tasks", "update")
    .input(z.object({ ...versioned, assignedWorkerId: z.number().int().positive().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenant = ctx.tenant!;
      const [task] = await db.select({ farmId: tasks.farmId }).from(tasks).where(and(
        tenantScope(tenant, tasks), eq(tasks.id, input.id), isNull(tasks.deletedAt),
      )).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      if (input.assignedWorkerId) await assertWorkerInFarm(db, tenant.companyId, task.farmId, input.assignedWorkerId);
      const rows = await db.update(tasks).set({
        assignedWorkerId: input.assignedWorkerId, version: input.expectedVersion + 1,
      }).where(and(
        tenantScope(tenant, tasks), eq(tasks.id, input.id), eq(tasks.version, input.expectedVersion), isNull(tasks.deletedAt),
      )).returning({ id: tasks.id });
      requireUpdated(rows, "Task");
      await createAuditEntry({
        userId: ctx.user.id, entityType: "task", entityId: String(input.id), action: "update",
        newValues: { assignedWorkerId: input.assignedWorkerId }, ipAddress: getClientIp(ctx),
      });
      return { success: true };
    }),

  // ─── OWNER: DAY REPORTS ───────────────────────────────────────────────────
  dayReports: permissionProcedure("tasks", "view")
    .input(z.object({ from: isoDate.optional(), to: isoDate.optional() }).optional())
    .query(({ input, ctx }) => listDayReports(ctx.tenant!, input)),

  dayReport: permissionProcedure("tasks", "view")
    .input(z.object({ date: isoDate }))
    .query(({ input, ctx }) => getDayReport(ctx.tenant!, input.date)),

  deleteDayReport: permissionProcedure("tasks", "delete")
    .input(z.object({ date: isoDate }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenant = ctx.tenant!;
      const result = await db.transaction(tx => deleteDayReport(tx, tenant, { date: input.date, ipAddress: getClientIp(ctx) }));
      // The day is already deleted, so a failure here mustn't report that it wasn't.
      await retireFarmImages(result.photoKeys).catch(error => {
        logger.warn("tasks.retire_photos_failed", { error, count: result.photoKeys.length });
      });
      return { answers: result.answers, tasksReset: result.tasksReset };
    }),

  // ─── OWNER: REPEATING TASKS ───────────────────────────────────────────────
  listTemplates: permissionProcedure("tasks", "view")
    .query(({ ctx }) => listTemplates(ctx.tenant!)),

  createTemplate: permissionProcedure("tasks", "create")
    .input(z.object({ title, notes, weekdays, assignedWorkerId }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenant = ctx.tenant!;
      const farmId = requireFarmId(tenant);
      if (input.assignedWorkerId) await assertWorkerInFarm(db, tenant.companyId, farmId, input.assignedWorkerId);
      const [row] = await db.insert(taskTemplates).values({
        ...input,
        publicId: generatePublicId(),
        companyId: tenant.companyId,
        farmId,
        createdBy: ctx.user.id,
      }).returning({ id: taskTemplates.id });
      await createAuditEntry({
        userId: ctx.user.id, entityType: "taskTemplate", entityId: String(row.id), action: "create",
        newValues: input as any, ipAddress: getClientIp(ctx),
      });
      return row;
    }),

  updateTemplate: permissionProcedure("tasks", "update")
    .input(z.object({ ...versioned, title, notes, weekdays, isActive: z.boolean(), assignedWorkerId }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenant = ctx.tenant!;
      const { id, expectedVersion, ...data } = input;
      await db.transaction(async tx => {
        const template = await templateInScope(tx, tenant, id);
        if (data.assignedWorkerId) await assertWorkerInFarm(tx, tenant.companyId, template.farmId, data.assignedWorkerId);
        const rows = await tx.update(taskTemplates).set({ ...data, version: expectedVersion + 1 }).where(and(
          tenantScope(tenant, taskTemplates),
          eq(taskTemplates.id, id),
          eq(taskTemplates.version, expectedVersion),
          isNull(taskTemplates.deletedAt),
        )).returning({ id: taskTemplates.id });
        requireUpdated(rows, "Repeating task");
        const sourceKey = await todaysCopyKey(tx, tenant, template);
        const todaysCopy = (deleted: boolean) => and(
          eq(tasks.companyId, tenant.companyId),
          eq(tasks.farmId, template.farmId),
          eq(tasks.sourceKey, sourceKey),
          eq(tasks.status, "todo"),
          deleted ? isNotNull(tasks.deletedAt) : isNull(tasks.deletedAt),
        );
        // Today's copy is already made, so a change wouldn't show until tomorrow.
        // Pausing takes it off the tablet, and switching back on the same day returns it.
        if (template.isActive && !data.isActive) {
          await tx.update(tasks).set({ deletedAt: new Date(), deletedBy: ctx.user.id, version: sql`${tasks.version} + 1` })
            .where(todaysCopy(false));
        } else if (!template.isActive && data.isActive) {
          await tx.update(tasks).set({ deletedAt: null, deletedBy: null, version: sql`${tasks.version} + 1` })
            .where(todaysCopy(true));
        }
        await tx.update(tasks).set({
          title: data.title, notes: data.notes ?? null, assignedWorkerId: data.assignedWorkerId ?? null,
          version: sql`${tasks.version} + 1`,
        }).where(todaysCopy(false));
        await createAuditEntry({
          userId: ctx.user.id, entityType: "taskTemplate", entityId: String(id), action: "update",
          newValues: data as any, ipAddress: getClientIp(ctx),
        }, tx);
      });
      return { success: true };
    }),

  deleteTemplate: permissionProcedure("tasks", "delete")
    .input(z.object(versioned))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenant = ctx.tenant!;
      await db.transaction(async tx => {
        const template = await templateInScope(tx, tenant, input.id);
        const rows = await tx.update(taskTemplates).set({
          deletedAt: new Date(), deletedBy: ctx.user.id, version: input.expectedVersion + 1,
        }).where(and(
          tenantScope(tenant, taskTemplates),
          eq(taskTemplates.id, input.id),
          eq(taskTemplates.version, input.expectedVersion),
          isNull(taskTemplates.deletedAt),
        )).returning({ id: taskTemplates.id });
        requireUpdated(rows, "Repeating task");
        await tx.update(tasks).set({
          deletedAt: new Date(), deletedBy: ctx.user.id, version: sql`${tasks.version} + 1`,
        }).where(and(
          eq(tasks.companyId, tenant.companyId),
          eq(tasks.farmId, template.farmId),
          eq(tasks.sourceKey, await todaysCopyKey(tx, tenant, template)),
          eq(tasks.status, "todo"),
          isNull(tasks.deletedAt),
        ));
        await createAuditEntry({
          userId: ctx.user.id, entityType: "taskTemplate", entityId: String(input.id), action: "delete", ipAddress: getClientIp(ctx),
        }, tx);
      });
      return { success: true };
    }),

  // ─── OWNER: WORKER NAMES ──────────────────────────────────────────────────
  listWorkers: permissionProcedure("tasks", "view")
    .query(({ ctx }) => listWorkers(ctx.tenant!)),

  createWorker: permissionProcedure("tasks", "create")
    .input(z.object({ name: workerName }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenant = ctx.tenant!;
      const [row] = await db.insert(workers).values({
        ...input,
        publicId: generatePublicId(),
        companyId: tenant.companyId,
        farmId: requireFarmId(tenant),
        createdBy: ctx.user.id,
      }).returning({ id: workers.id }).catch(error => { throw duplicateWorkerName(error); });
      await createAuditEntry({
        userId: ctx.user.id, entityType: "worker", entityId: String(row.id), action: "create",
        newValues: input as any, ipAddress: getClientIp(ctx),
      });
      return row;
    }),

  updateWorker: permissionProcedure("tasks", "update")
    .input(z.object({ ...versioned, name: workerName, isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const { id, expectedVersion, ...data } = input;
      const rows = await db.update(workers).set({ ...data, version: expectedVersion + 1 }).where(and(
        tenantScope(ctx.tenant!, workers), eq(workers.id, id), eq(workers.version, expectedVersion),
      )).returning({ id: workers.id }).catch(error => { throw duplicateWorkerName(error); });
      requireUpdated(rows, "Worker");
      await createAuditEntry({
        userId: ctx.user.id, entityType: "worker", entityId: String(id), action: "update",
        newValues: data as any, ipAddress: getClientIp(ctx),
      });
      return { success: true };
    }),

  setWorkerPhoto: permissionProcedure("tasks", "update")
    .input(z.object({ ...versioned, dataUrl: photoDataUrl.nullable() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenant = ctx.tenant!;
      const [worker] = await db.select({ publicId: workers.publicId, photoKey: workers.photoKey }).from(workers).where(and(
        tenantScope(tenant, workers), eq(workers.id, input.id),
      )).limit(1);
      if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "Worker not found" });
      const photoKey = input.dataUrl ? await storePhoto(`workers/${worker.publicId}`, input.dataUrl) : null;
      const rows = await db.update(workers).set({ photoKey, version: input.expectedVersion + 1 }).where(and(
        tenantScope(tenant, workers), eq(workers.id, input.id), eq(workers.version, input.expectedVersion),
      )).returning({ id: workers.id });
      if (rows.length === 0 && photoKey) await retireFarmImages([photoKey]);
      requireUpdated(rows, "Worker");
      if (worker.photoKey) await retireFarmImages([worker.photoKey]);
      await createAuditEntry({
        userId: ctx.user.id, entityType: "worker", entityId: String(input.id), action: "update",
        newValues: { photo: photoKey ? "changed" : "removed" }, ipAddress: getClientIp(ctx),
      });
      return { success: true };
    }),

  // ─── OWNER: CONNECTING TABLETS ────────────────────────────────────────────
  tabletStatus: permissionProcedure("tasks", "view")
    .query(({ ctx }) => getTabletStatus(ctx.tenant!)),

  createTabletCode: permissionProcedure("tasks", "create")
    .mutation(async ({ ctx }) => {
      const result = await createTabletCode(ctx.tenant!);
      await createAuditEntry({
        userId: ctx.user.id, entityType: "tablet", entityId: String(requireFarmId(ctx.tenant!)), action: "tablet_code", ipAddress: getClientIp(ctx),
      });
      return result;
    }),

  disconnectTablets: permissionProcedure("tasks", "update")
    .mutation(async ({ ctx }) => {
      await disconnectTablets(ctx.tenant!);
      await createAuditEntry({
        userId: ctx.user.id, entityType: "tablet", entityId: String(requireFarmId(ctx.tenant!)), action: "tablet_disconnect", ipAddress: getClientIp(ctx),
      });
      return { success: true };
    }),
});
