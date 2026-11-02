import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  animalStatuses,
  animals,
  companyMemberships,
  farmMemberships,
  farms,
  vaccinationRecords,
  vaccines,
} from "../../drizzle/schema";
import { farmReports, taskTemplates, tasks, workerCheckins, workers } from "../../drizzle/schema.workerTasks";
import {
  addDays,
  farmToday,
  isDeathStatusName,
  isDueOnWeekday,
  isFinished,
  matchAnimalTag,
  missingDailyReports,
  nextTaskProgress,
  normalizeDigits,
  reportDay,
  tapTime,
  VACCINATION_LOOKBACK_DAYS,
  WORKER_NOT_ALLOWED,
  type AnimalReport,
  type BlockedReason,
  type PurchaseKind,
  type StockKind,
  type TaskAction,
  type TaskSource,
  type TaskStatus,
} from "../../shared/tasks";
import { taskNotificationText, type NotificationParams } from "../../shared/notificationText";
import type { TenantContext } from "../../shared/tenancy";
import {
  createAuditEntry,
  createNotification,
  getDb,
  getRawAnimalForUpdate,
  recordStatusChange,
  updateAnimal,
  type DbOrTx,
} from "../db";
import type { TaskAlert } from "../notifications/fanout";
import { generatePublicId } from "../tenancy/publicIds";
import { tenantScope } from "../tenancy/scope";

async function requireDb(): Promise<DbOrTx> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

/** Tasks belong to one farm, so writes need one chosen. A one-farm account always has. */
export function requireFarmId(tenant: TenantContext): number {
  if (tenant.selectedFarmId === null) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "FARM_SELECTION_REQUIRED" });
  }
  return tenant.selectedFarmId;
}

async function farmZone(db: DbOrTx, tenant: TenantContext): Promise<string> {
  if (tenant.selectedFarmId === null) return "UTC";
  const [farm] = await db.select({ timezone: farms.timezone }).from(farms)
    .where(and(eq(farms.companyId, tenant.companyId), eq(farms.id, tenant.selectedFarmId)))
    .limit(1);
  return farm?.timezone ?? "UTC";
}

export async function farmDate(db: DbOrTx, tenant: TenantContext): Promise<string> {
  return farmToday(await farmZone(db, tenant));
}

/** Wide enough for any time zone's "today"; finishedToday narrows it down. */
const finishedRecently = () => gte(tasks.finishedAt, new Date(Date.now() - 36 * 60 * 60 * 1_000));

/** An older task finished today stays on the day's list, where Undo and the owner can reach it. */
function finishedToday(zone: string, date: string) {
  return (task: { dueDate: string; status: TaskStatus; finishedAt: Date | null }) =>
    task.dueDate >= date
    || !isFinished(task.status)
    || (task.finishedAt !== null && farmToday(zone, task.finishedAt) === date);
}

type GeneratedTask = {
  title: string;
  notes?: string | null;
  animalId?: number | null;
  assignedWorkerId?: number | null;
  source: TaskSource;
  sourceKey: string;
};

async function generatedTasksFor(db: DbOrTx, tenant: TenantContext, farmId: number, date: string) {
  const [templates, dueVaccinations] = await Promise.all([
    db.select().from(taskTemplates).where(and(
      eq(taskTemplates.companyId, tenant.companyId),
      eq(taskTemplates.farmId, farmId),
      eq(taskTemplates.isActive, true),
      isNull(taskTemplates.deletedAt),
    )),
    // Not getUpcomingVaccinations: that also returns animals already sold, and
    // reaches back indefinitely, which would bury a new tablet in old alerts.
    db.select({
      id: vaccinationRecords.id,
      animalId: vaccinationRecords.animalId,
      vaccineName: vaccines.name,
      nextDueDate: vaccinationRecords.nextDueDate,
      boosterDueDate: vaccinationRecords.boosterDueDate,
    }).from(vaccinationRecords)
      .innerJoin(vaccines, and(eq(vaccinationRecords.vaccineId, vaccines.id), eq(vaccines.companyId, tenant.companyId)))
      .innerJoin(animals, and(eq(vaccinationRecords.animalId, animals.id), eq(animals.companyId, tenant.companyId)))
      .where(and(
        eq(vaccinationRecords.companyId, tenant.companyId),
        eq(vaccinationRecords.farmId, farmId),
        isNull(vaccinationRecords.deletedAt),
        eq(vaccinationRecords.isCompleted, false),
        eq(animals.isActive, true),
        isNull(animals.deletedAt),
      )),
  ]);

  const generated: GeneratedTask[] = [];
  for (const template of templates) {
    if (!isDueOnWeekday(template.weekdays, date)) continue;
    generated.push({
      title: template.title,
      notes: template.notes,
      assignedWorkerId: template.assignedWorkerId,
      source: "template",
      sourceKey: `template:${template.id}:${date}`,
    });
  }
  const earliest = addDays(date, -VACCINATION_LOOKBACK_DAYS);
  for (const record of dueVaccinations) {
    for (const [kind, dueDate] of [["next", record.nextDueDate], ["booster", record.boosterDueDate]] as const) {
      if (!dueDate || dueDate > date || dueDate < earliest) continue;
      generated.push({
        title: record.vaccineName,
        animalId: record.animalId,
        source: "vaccination",
        sourceKey: `vaccination:${record.id}:${kind}:${dueDate}`,
      });
    }
  }
  return generated;
}

/**
 * A vaccination stops being due when its record is completed or the animal
 * leaves, however that happened, so an open task that's no longer due is dropped
 * rather than left asking for an animal that's gone. Removed outright: a kept row
 * would hold its sourceKey and stop the task coming back if the change is undone.
 */
async function retireStaleVaccinationTasks(db: DbOrTx, tenant: TenantContext, farmId: number, generated: GeneratedTask[]) {
  const open = await db.select({ id: tasks.id, sourceKey: tasks.sourceKey }).from(tasks).where(and(
    eq(tasks.companyId, tenant.companyId),
    eq(tasks.farmId, farmId),
    eq(tasks.source, "vaccination"),
    inArray(tasks.status, ["todo", "started"]),
    isNull(tasks.deletedAt),
  ));
  const due = new Set(generated.map(task => task.sourceKey));
  const stale = open.filter(task => !task.sourceKey || !due.has(task.sourceKey)).map(task => task.id);
  if (stale.length === 0) return;
  await db.delete(tasks).where(and(eq(tasks.companyId, tenant.companyId), inArray(tasks.id, stale)));
}

/**
 * Puts today's repeating chores and due vaccinations on the list. Runs on read
 * so no scheduler has to exist, and repeated or concurrent calls settle on one
 * row per sourceKey.
 */
export async function materializeTasks(tenant: TenantContext, date: string) {
  const farmId = tenant.selectedFarmId;
  if (farmId === null) return;
  const db = await requireDb();
  const generated = await generatedTasksFor(db, tenant, farmId, date);
  await retireStaleVaccinationTasks(db, tenant, farmId, generated);
  if (generated.length === 0) return;

  // Checked first because the tablet polls: a conflicting insert still burns a
  // sequence value per row, every minute, forever.
  const existing = await db.select({ sourceKey: tasks.sourceKey }).from(tasks).where(and(
    eq(tasks.companyId, tenant.companyId),
    eq(tasks.farmId, farmId),
    inArray(tasks.sourceKey, generated.map(task => task.sourceKey)),
  ));
  const existingKeys = new Set(existing.map(row => row.sourceKey));
  const missing = generated.filter(task => !existingKeys.has(task.sourceKey));
  if (missing.length === 0) return;

  await db.insert(tasks).values(missing.map(task => ({
    ...task,
    publicId: generatePublicId(),
    companyId: tenant.companyId,
    farmId,
    dueDate: date,
  }))).onConflictDoNothing();
}

/** Served by the file proxy, which checks the session and the farm on every request. */
function photoUrl(key: string | null) {
  return key ? `/manus-storage/${key}` : null;
}

async function listTaskRows(tenant: TenantContext, where: ReturnType<typeof and>, limit = 500) {
  const db = await requireDb();
  const [rows, names] = await Promise.all([
    db.select({
      task: tasks,
      animalTag: animals.animalId,
    }).from(tasks)
      .leftJoin(animals, and(eq(tasks.animalId, animals.id), eq(animals.companyId, tenant.companyId)))
      .where(and(tenantScope(tenant, tasks), isNull(tasks.deletedAt), where))
      .orderBy(asc(tasks.dueDate), asc(tasks.id))
      .limit(limit),
    db.select({ id: workers.id, name: workers.name }).from(workers).where(tenantScope(tenant, workers)),
  ]);
  const nameOf = new Map(names.map(worker => [worker.id, worker.name]));
  return rows.map(({ task, animalTag }) => ({
    id: task.id,
    version: task.version,
    title: task.title,
    notes: task.notes,
    source: task.source,
    animalId: task.animalId,
    animalTag,
    assignedWorkerId: task.assignedWorkerId,
    assignedName: task.assignedWorkerId ? nameOf.get(task.assignedWorkerId) ?? null : null,
    dueDate: task.dueDate,
    status: task.status,
    startedByWorkerId: task.startedByWorkerId,
    startedByName: task.startedByWorkerId ? nameOf.get(task.startedByWorkerId) ?? null : null,
    startedAt: task.startedAt,
    finishedByWorkerId: task.finishedByWorkerId,
    finishedByName: task.finishedByWorkerId ? nameOf.get(task.finishedByWorkerId) ?? null : null,
    finishedAt: task.finishedAt,
    blockedReason: task.blockedReason,
  }));
}

/** Everything the tablet shows, and nothing it doesn't. */
export async function getTabletDay(tenant: TenantContext) {
  const db = await requireDb();
  const zone = await farmZone(db, tenant);
  const date = farmToday(zone);
  await materializeTasks(tenant, date);
  const [rows, roster, reports] = await Promise.all([
    listTaskRows(tenant, or(
      eq(tasks.dueDate, date),
      and(
        lt(tasks.dueDate, date),
        inArray(tasks.source, ["manual", "vaccination"]),
        or(inArray(tasks.status, ["todo", "started"]), finishedRecently()),
      ),
    )).then(found => found.filter(finishedToday(zone, date))),
    db.select({ id: workers.id, name: workers.name, photoKey: workers.photoKey }).from(workers)
      .where(and(tenantScope(tenant, workers), eq(workers.isActive, true)))
      .orderBy(asc(workers.name)),
    // Without the amount: what was paid stays off the shared screen.
    db.select({
      id: farmReports.id,
      type: farmReports.type,
      answer: farmReports.answer,
      animalTag: farmReports.animalTag,
      stockKinds: farmReports.stockKinds,
      purchaseKind: farmReports.purchaseKind,
      itemName: farmReports.itemName,
      workerName: workers.name,
    }).from(farmReports)
      .innerJoin(workers, and(eq(farmReports.workerId, workers.id), eq(workers.companyId, tenant.companyId)))
      .where(and(tenantScope(tenant, farmReports), eq(farmReports.reportDate, date), isNull(farmReports.deletedAt)))
      .orderBy(desc(farmReports.id)),
  ]);
  return {
    date,
    timeZone: zone,
    farmSelected: tenant.selectedFarmId !== null,
    tasks: rows,
    workers: roster.map(({ id, name, photoKey }) => ({ id, name, photoUrl: photoUrl(photoKey) })),
    reports,
  };
}

const OVERVIEW_DAYS = 7;

/** The owner's view: today, plus the last week's unfinished work, missed chores included. */
export async function getOwnerOverview(tenant: TenantContext) {
  const db = await requireDb();
  const zone = await farmZone(db, tenant);
  const date = farmToday(zone);
  await materializeTasks(tenant, date);
  const rows = await listTaskRows(tenant, or(
    gte(tasks.dueDate, date),
    and(
      gte(tasks.dueDate, addDays(date, -OVERVIEW_DAYS)),
      inArray(tasks.status, ["todo", "started"]),
    ),
    // Whatever the tablet still shows, or the owner couldn't remove it.
    and(inArray(tasks.source, ["manual", "vaccination"]), inArray(tasks.status, ["todo", "started"])),
    and(lt(tasks.dueDate, date), finishedRecently()),
  ));
  return { date, tasks: rows.filter(finishedToday(zone, date)) };
}

export async function listTemplates(tenant: TenantContext) {
  const db = await requireDb();
  return db.select().from(taskTemplates)
    .where(and(tenantScope(tenant, taskTemplates), isNull(taskTemplates.deletedAt)))
    .orderBy(desc(taskTemplates.isActive), asc(taskTemplates.title));
}

export async function listWorkers(tenant: TenantContext) {
  const db = await requireDb();
  const rows = await db.select().from(workers)
    .where(tenantScope(tenant, workers))
    .orderBy(desc(workers.isActive), asc(workers.name));
  return rows.map(row => ({ ...row, photoUrl: photoUrl(row.photoKey) }));
}

const REPORT_HISTORY_DAYS = 30;
const REPORT_LIST_LIMIT = 1000;

/** The owner's list, with each typed tag matched to an animal where one fits. */
/** Reports are kept until someone deletes one; the range only picks what to look at. */
export async function listReports(tenant: TenantContext, range?: { from?: string; to?: string }) {
  const db = await requireDb();
  const date = await farmDate(db, tenant);
  const rows = await db.select({ report: farmReports, workerName: workers.name }).from(farmReports)
    .innerJoin(workers, and(eq(farmReports.workerId, workers.id), eq(workers.companyId, tenant.companyId)))
    .where(and(
      tenantScope(tenant, farmReports),
      gte(farmReports.reportDate, range?.from ?? addDays(date, -REPORT_HISTORY_DAYS)),
      lte(farmReports.reportDate, range?.to ?? date),
      isNull(farmReports.deletedAt),
    ))
    .orderBy(desc(farmReports.reportDate), desc(farmReports.id))
    .limit(REPORT_LIST_LIMIT);
  const herd = rows.some(({ report }) => report.animalTag) ? await herdByFarm(db, tenant) : new Map<number, HerdAnimal[]>();
  return rows.map(({ report, workerName }) => {
    const farmHerd = herd.get(report.farmId) ?? [];
    // Once confirmed the animal is known; the typed number no longer has to find it.
    const animal = report.animalId
      ? farmHerd.find(candidate => candidate.id === report.animalId) ?? null
      : report.animalTag ? matchAnimalTag(report.animalTag, farmHerd) : null;
    return {
      ...report,
      workerName,
      matchedAnimalId: animal?.id ?? null,
      matchedAnimalTag: animal?.tag ?? null,
      matchedAnimalActive: animal?.isActive ?? false,
    };
  });
}

/** Which of today's questions are still waiting, for the selected farm. */
export async function getReportStatus(tenant: TenantContext) {
  if (tenant.selectedFarmId === null) return null;
  const db = await requireDb();
  const date = await farmDate(db, tenant);
  const reports = await db.select({ type: farmReports.type }).from(farmReports).where(and(
    tenantScope(tenant, farmReports),
    eq(farmReports.reportDate, date),
    isNull(farmReports.deletedAt),
  ));
  return { date, missing: missingDailyReports(reports) };
}

type HerdAnimal = { id: number; tag: string; farmId: number; isActive: boolean };

async function herdByFarm(db: DbOrTx, tenant: TenantContext) {
  const rows = await db.select({ id: animals.id, tag: animals.animalId, farmId: animals.farmId, isActive: animals.isActive })
    .from(animals)
    .where(and(tenantScope(tenant, animals), isNull(animals.deletedAt)));
  const herd = new Map<number, HerdAnimal[]>();
  for (const animal of rows) {
    const farmHerd = herd.get(animal.farmId);
    if (farmHerd) farmHerd.push(animal);
    else herd.set(animal.farmId, [animal]);
  }
  return herd;
}

/** Owners, admins and supervisors who can see this farm. */
export async function taskRecipients(db: DbOrTx, tenant: Pick<TenantContext, "companyId">, farmId: number): Promise<number[]> {
  const rows = await db.select({ userId: companyMemberships.userId }).from(companyMemberships)
    .leftJoin(farmMemberships, and(
      eq(farmMemberships.companyId, companyMemberships.companyId),
      eq(farmMemberships.companyMembershipId, companyMemberships.id),
      eq(farmMemberships.farmId, farmId),
    ))
    .where(and(
      eq(companyMemberships.companyId, tenant.companyId),
      eq(companyMemberships.status, "active"),
      inArray(companyMemberships.role, ["owner", "admin", "supervisor"]),
      or(eq(companyMemberships.farmAccessMode, "all"), sql`${farmMemberships.farmId} IS NOT NULL`),
    ));
  return [...new Set(rows.map(row => row.userId))];
}

const TASK_NOTICES: Record<TaskAction, { alertType: string; priority: "low" | "medium" | "high" }> = {
  start: { alertType: "task_started", priority: "low" },
  done: { alertType: "task_done", priority: "medium" },
  blocked: { alertType: "task_blocked", priority: "high" },
  undo: { alertType: "task_undone", priority: "low" },
};

/** The in-app row for each recipient, and what the caller sends on once the work commits. */
async function notifyRecipients(
  tx: DbOrTx,
  tenant: TenantContext,
  farmId: number,
  notice: {
    alertType: string;
    priority: "low" | "medium" | "high";
    relatedEntityType: string;
    relatedEntityId: string;
    params: NotificationParams;
  },
  onAlert?: (alert: TaskAlert) => void,
) {
  const recipients = await taskRecipients(tx, tenant, farmId);
  // The stored English is what other surfaces and old rows fall back on.
  const { title, message } = taskNotificationText(notice.alertType, notice.params, "en")!;
  for (const userId of recipients) {
    await createNotification({
      userId,
      alertType: notice.alertType,
      title,
      message,
      params: notice.params,
      relatedEntityType: notice.relatedEntityType,
      relatedEntityId: notice.relatedEntityId,
      priority: notice.priority,
    }, tx);
  }
  onAlert?.({
    companyId: tenant.companyId,
    alertType: notice.alertType,
    relatedEntityType: notice.relatedEntityType,
    priority: notice.priority,
    params: notice.params,
    recipientUserIds: recipients,
  });
}

/**
 * Enforces the owner's "allowed to do tasks" switch: a name that's off is refused,
 * unless the tap was made before it was switched off and only now reached the server
 * after waiting offline. The tablet is shared, so this is about the name, not the login.
 */
export async function requireAllowedWorker(
  tx: DbOrTx,
  tenant: TenantContext,
  farmId: number,
  workerId: number,
  tappedAt: string | null | undefined,
) {
  // Measured by the database, as the trigger sets updatedAt in the session's time zone.
  const [worker] = await tx.select({
    name: workers.name,
    isActive: workers.isActive,
    secondsSinceChange: sql<string>`extract(epoch from (localtimestamp - ${workers.updatedAt}))`,
  }).from(workers).where(and(
      eq(workers.companyId, tenant.companyId),
      eq(workers.farmId, farmId),
      eq(workers.id, workerId),
    )).limit(1);
  if (!worker) throw new TRPCError({ code: "BAD_REQUEST", message: "Worker not found" });
  // A second's margin: updatedAt is stored in whole seconds, and can round up.
  const madeBeforeChange = tappedAt
    && Date.now() - tapTime(tappedAt).getTime() >= (Number(worker.secondsSinceChange) + 1) * 1_000;
  if (!worker.isActive && !madeBeforeChange) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: WORKER_NOT_ALLOWED });
  }
  return worker;
}

/** Applies a tablet tap. Must run inside the caller's transaction. */
export async function recordTaskAction(
  tx: DbOrTx,
  tenant: TenantContext,
  input: { taskId: number; action: TaskAction; workerId?: number | null; reason?: BlockedReason | null; tappedAt?: string | null; ipAddress?: string | null },
  onAlert?: (alert: TaskAlert) => void,
) {
  const [task] = await tx.select().from(tasks).where(and(
    tenantScope(tenant, tasks),
    eq(tasks.id, input.taskId),
    isNull(tasks.deletedAt),
  )).limit(1).for("update");
  if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });

  const workerId = input.workerId ?? null;
  if (workerId !== null) {
    await requireAllowedWorker(tx, tenant, task.farmId, workerId, input.tappedAt);
  } else if (input.action !== "undo" && !(input.action === "done" && task.startedByWorkerId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Worker is required" });
  }

  const next = nextTaskProgress(task, {
    action: input.action,
    workerId,
    reason: input.reason,
  }, tapTime(input.tappedAt));
  if (!next) return { id: task.id, status: task.status, changed: false };

  await tx.update(tasks).set({
    status: next.status,
    startedByWorkerId: next.startedByWorkerId,
    startedAt: next.startedAt,
    finishedByWorkerId: next.finishedByWorkerId,
    finishedAt: next.finishedAt,
    blockedReason: next.blockedReason,
    version: task.version + 1,
  }).where(eq(tasks.id, task.id));

  const actorId = input.action === "undo"
    ? task.finishedByWorkerId
    : input.action === "start" ? workerId : next.finishedByWorkerId;
  const [actor] = actorId === null ? [] : await tx.select({ name: workers.name }).from(workers)
    .where(and(eq(workers.companyId, task.companyId), eq(workers.id, actorId))).limit(1);
  const workerName = actor?.name ?? "A worker";

  const [animal] = task.animalId === null ? [] : await tx.select({ tag: animals.animalId }).from(animals)
    .where(and(eq(animals.companyId, task.companyId), eq(animals.id, task.animalId))).limit(1);
  const isVaccination = task.source === "vaccination";
  await notifyRecipients(tx, tenant, task.farmId, {
    ...TASK_NOTICES[input.action],
    relatedEntityType: isVaccination ? "vaccination_task" : "task",
    relatedEntityId: String(task.id),
    params: {
      worker: workerName,
      ...(isVaccination ? { vaccine: task.title } : { task: task.title }),
      animal: animal?.tag,
      reason: input.action === "blocked" ? next.blockedReason : null,
    },
  }, onAlert);

  await createAuditEntry({
    userId: tenant.userId,
    entityType: "task",
    entityId: String(task.id),
    action: `task_${input.action}`,
    farmId: task.farmId,
    oldValues: { status: task.status },
    newValues: { status: next.status, blockedReason: next.blockedReason },
    // Picked on a shared screen with no password: a record of what was claimed.
    metadata: { selfDeclaredWorker: workerName, workerId: actorId },
    ipAddress: input.ipAddress ?? undefined,
  }, tx);

  return { id: task.id, status: next.status, changed: true };
}

export type FarmReportInput = { workerId: number; reportDate?: string | null; tappedAt?: string | null } & (
  | { type: "doctor_visit"; answer: boolean }
  | { type: "stock_needed"; answer: boolean; stockKinds?: StockKind[] | null; itemName?: string | null }
  | { type: AnimalReport; animalTag: string }
  | { type: "purchase"; purchaseKind: PurchaseKind; itemName?: string | null; amount: number }
);

const REPORT_PRIORITIES: Record<FarmReportInput["type"], (input: FarmReportInput) => "low" | "medium" | "high"> = {
  doctor_visit: input => ("answer" in input && input.answer ? "medium" : "low"),
  stock_needed: input => ("answer" in input && input.answer ? "high" : "low"),
  animal_dead: () => "high",
  animal_sick: () => "high",
  purchase: () => "medium",
};

function reportParams(input: FarmReportInput, tag: string | null, worker: string): NotificationParams {
  if ("answer" in input) {
    const stock = input.type === "stock_needed" && input.answer;
    return { worker, answer: input.answer, kinds: stock ? input.stockKinds : null, item: stock ? input.itemName : null };
  }
  if ("purchaseKind" in input) {
    return { worker, purchaseKind: input.purchaseKind, item: input.itemName, amount: input.amount.toFixed(2) };
  }
  return { worker, tag: tag ?? undefined };
}

/**
 * Saves a report from the tablet and tells the owner. Deliberately stops there:
 * the name is self-declared and the tag hand-typed, so only the owner's
 * confirmation marks an animal dead. Must run inside the caller's transaction.
 */
export async function submitFarmReport(
  tx: DbOrTx,
  tenant: TenantContext,
  input: FarmReportInput & { ipAddress?: string | null },
  onAlert?: (alert: TaskAlert) => void,
) {
  const farmId = requireFarmId(tenant);
  const worker = await requireAllowedWorker(tx, tenant, farmId, input.workerId, input.tappedAt);

  const reportDate = reportDay(input.reportDate, await farmDate(tx, tenant));
  const base = {
    companyId: tenant.companyId,
    farmId,
    reportDate,
    type: input.type,
    workerId: input.workerId,
    createdBy: tenant.userId,
  };

  let id: number;
  let tag: string | null = null;
  if ("answer" in input) {
    const dailyAnswer = and(
      eq(farmReports.companyId, tenant.companyId),
      eq(farmReports.farmId, farmId),
      eq(farmReports.reportDate, reportDate),
      eq(farmReports.type, input.type),
      isNull(farmReports.deletedAt),
    );
    const isStock = input.type === "stock_needed" && input.answer;
    const answer = {
      answer: input.answer,
      stockKinds: isStock ? [...new Set(input.stockKinds ?? [])].sort() : null,
      itemName: isStock ? input.itemName?.trim() || null : null,
      workerId: input.workerId,
    };
    const [existing] = await tx.select({
      id: farmReports.id,
      answer: farmReports.answer,
      stockKinds: farmReports.stockKinds,
      itemName: farmReports.itemName,
      version: farmReports.version,
    }).from(farmReports).where(dailyAnswer).limit(1).for("update");
    // Same answer again: nothing new to tell anyone.
    if (existing
      && existing.answer === answer.answer
      && existing.itemName === answer.itemName
      && String(existing.stockKinds) === String(answer.stockKinds)) {
      return { id: existing.id, changed: false };
    }
    if (existing) {
      await tx.update(farmReports)
        .set({ ...answer, version: existing.version + 1 })
        .where(eq(farmReports.id, existing.id));
      id = existing.id;
    } else {
      const [row] = await tx.insert(farmReports).values({ ...base, ...answer, publicId: generatePublicId() })
        // Two tablets answering at once: the later one's answer stands.
        .onConflictDoUpdate({
          target: [farmReports.companyId, farmReports.farmId, farmReports.reportDate, farmReports.type],
          targetWhere: sql`"answer" IS NOT NULL AND "deletedAt" IS NULL`,
          set: answer,
        })
        .returning({ id: farmReports.id });
      id = row.id;
    }
  } else if ("purchaseKind" in input) {
    const [row] = await tx.insert(farmReports).values({
      ...base,
      publicId: generatePublicId(),
      purchaseKind: input.purchaseKind,
      itemName: input.itemName?.trim() || null,
      amount: input.amount.toFixed(2),
    }).returning({ id: farmReports.id });
    id = row.id;
  } else {
    tag = normalizeDigits(input.animalTag).trim();
    const [row] = await tx.insert(farmReports).values({ ...base, publicId: generatePublicId(), animalTag: tag })
      .returning({ id: farmReports.id });
    id = row.id;
  }

  await notifyRecipients(tx, tenant, farmId, {
    alertType: `task_report_${input.type}`,
    priority: REPORT_PRIORITIES[input.type](input),
    relatedEntityType: "farm_report",
    relatedEntityId: String(id),
    params: reportParams(input, tag, worker.name),
  }, onAlert);

  await createAuditEntry({
    userId: tenant.userId,
    entityType: "farmReport",
    entityId: String(id),
    action: "report_create",
    farmId,
    newValues: { type: input.type, reportDate },
    metadata: { selfDeclaredWorker: worker.name, workerId: input.workerId },
    ipAddress: input.ipAddress ?? undefined,
  }, tx);

  return { id, changed: true };
}

/** The company's death status, created on first use so confirming stays one click. */
async function deathStatusId(tx: DbOrTx, tenant: TenantContext): Promise<number> {
  const statuses = await tx.select({ id: animalStatuses.id, name: animalStatuses.name, isExitStatus: animalStatuses.isExitStatus, isActive: animalStatuses.isActive })
    .from(animalStatuses)
    .where(and(
      eq(animalStatuses.companyId, tenant.companyId),
      isNull(animalStatuses.deletedAt),
    ));
  const existing = statuses.find(status => status.isExitStatus && isDeathStatusName(status.name));
  if (existing) {
    // A switched-off status still holds its name, so it can't be created again.
    if (!existing.isActive) {
      await tx.update(animalStatuses).set({ isActive: true })
        .where(and(eq(animalStatuses.companyId, tenant.companyId), eq(animalStatuses.id, existing.id)));
    }
    return existing.id;
  }
  // The name is unique, and one that doesn't take animals out of the herd can't be reused.
  if (statuses.some(status => status.name.toLowerCase() === "dead")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "DEAD_STATUS_NOT_EXIT" });
  }
  const [created] = await tx.insert(animalStatuses).values({
    publicId: generatePublicId(),
    companyId: tenant.companyId,
    name: "Dead",
    isExitStatus: true,
    createdBy: tenant.userId,
  }).returning({ id: animalStatuses.id });
  return created.id;
}

/**
 * The owner's confirmation of a reported death: the same exit a sale makes, minus
 * the sale, so it reads the same in history and can be reverted from the audit
 * log. The animal's open tasks go too, or the tablet would keep asking for them.
 * Must run inside the caller's transaction.
 */
export async function confirmReportedDeath(
  tx: DbOrTx,
  tenant: TenantContext,
  input: { reportId: number; animalId: number; ipAddress?: string | null },
) {
  const [report] = await tx.select().from(farmReports).where(and(
    tenantScope(tenant, farmReports),
    eq(farmReports.id, input.reportId),
    eq(farmReports.type, "animal_dead"),
    isNull(farmReports.deletedAt),
  )).limit(1).for("update");
  if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
  if (report.confirmedAt) return { changed: false };

  const herd = await herdByFarm(tx, tenant);
  const match = matchAnimalTag(report.animalTag ?? "", herd.get(report.farmId) ?? []);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "ANIMAL_NOT_MATCHED" });
  // The number is matched afresh here, so it must still be the animal the owner was shown.
  if (match.id !== input.animalId) throw new TRPCError({ code: "CONFLICT", message: "ANIMAL_MATCH_CHANGED" });
  const animal = await getRawAnimalForUpdate(match.id, tx);
  if (!animal || animal.deletedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "ANIMAL_NOT_MATCHED" });
  if (!animal.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "ANIMAL_ALREADY_OUT" });
  // A number can be reused: this report is about an earlier animal, not the one that has it now.
  if (report.reportDate < String(animal.acquisitionDate).slice(0, 10)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "REPORT_BEFORE_ANIMAL" });
  }

  const statusId = await deathStatusId(tx, tenant);
  const affected = await updateAnimal(animal.id, {
    statusId,
    exitDate: report.reportDate as any,
    exitReason: "dead",
    isActive: false,
  }, tx, animal.version);
  if (affected !== 1) {
    throw new TRPCError({ code: "CONFLICT", message: "Animal changed since it was loaded. Refresh and try again." });
  }
  await recordStatusChange({
    animalId: animal.id,
    previousStatusId: animal.statusId,
    newStatusId: statusId,
    changedBy: tenant.userId,
    notes: "dead",
  }, tx);

  await tx.update(tasks).set({ deletedAt: new Date(), deletedBy: tenant.userId, version: sql`${tasks.version} + 1` }).where(and(
    eq(tasks.companyId, tenant.companyId),
    eq(tasks.animalId, animal.id),
    inArray(tasks.status, ["todo", "started"]),
    isNull(tasks.deletedAt),
  ));
  await tx.update(farmReports)
    .set({ animalId: animal.id, confirmedAt: new Date(), confirmedBy: tenant.userId, version: report.version + 1 })
    .where(eq(farmReports.id, report.id));

  await createAuditEntry({
    userId: tenant.userId,
    action: "exit",
    entityType: "animal",
    entityId: String(animal.id),
    farmId: report.farmId,
    // Prior state so the revert can reactivate the animal exactly.
    oldValues: { isActive: true, statusId: animal.statusId, exitDate: null, exitReason: null },
    newValues: { exitDate: report.reportDate, exitReason: "dead", version: animal.version + 1 },
    metadata: { farmReportId: report.id },
    ipAddress: input.ipAddress ?? undefined,
  }, tx);
  return { changed: true };
}

const DAY_REPORT_DAYS = 30;
const DAY_REPORT_TASK_LIMIT = 5_000;

/** The day a task counts towards: when it was finished, otherwise when it was due. */
function taskDay(task: { dueDate: string; status: TaskStatus; finishedAt: Date | null }, zone: string) {
  return isFinished(task.status) && task.finishedAt ? farmToday(zone, task.finishedAt) : task.dueDate;
}

/** A one-off left open keeps showing on the tablet, so it's part of today too. */
function belongsToDay(
  task: { dueDate: string; status: TaskStatus; finishedAt: Date | null; source: TaskSource },
  date: string,
  today: string,
  zone: string,
) {
  if (taskDay(task, zone) === date) return true;
  return date === today && !isFinished(task.status) && task.dueDate < today && task.source !== "template";
}

async function dayTasks(tenant: TenantContext, from: string, to: string, today: string) {
  return listTaskRows(tenant, or(
    and(gte(tasks.dueDate, from), lte(tasks.dueDate, to)),
    // Finished in the range, whenever it was due. A day either side covers time zones.
    and(gte(tasks.finishedAt, new Date(`${addDays(from, -1)}T00:00:00Z`)), lte(tasks.finishedAt, new Date(`${addDays(to, 1)}T23:59:59Z`))),
    to >= today ? and(lt(tasks.dueDate, today), inArray(tasks.status, ["todo", "started"])) : undefined,
  ), DAY_REPORT_TASK_LIMIT);
}

async function dayCheckins(db: DbOrTx, tenant: TenantContext, from: string, to: string) {
  return db.select({
    id: workerCheckins.id,
    reportDate: workerCheckins.reportDate,
    takenAt: workerCheckins.takenAt,
    photoKey: workerCheckins.photoKey,
    workerName: workers.name,
  }).from(workerCheckins)
    .innerJoin(workers, and(eq(workerCheckins.workerId, workers.id), eq(workers.companyId, tenant.companyId)))
    .where(and(
      tenantScope(tenant, workerCheckins),
      gte(workerCheckins.reportDate, from),
      lte(workerCheckins.reportDate, to),
      isNull(workerCheckins.deletedAt),
    ))
    .orderBy(desc(workerCheckins.takenAt));
}

/** One line per day. Worked out from the day's tasks, answers and photos, so it's always current. */
export async function listDayReports(tenant: TenantContext, range?: { from?: string; to?: string }) {
  const db = await requireDb();
  const zone = await farmZone(db, tenant);
  const today = farmToday(zone);
  await materializeTasks(tenant, today);
  const to = range?.to ?? today;
  const from = range?.from ?? addDays(to, -DAY_REPORT_DAYS);
  const [taskRows, reports, checkins] = await Promise.all([
    dayTasks(tenant, from, to, today),
    listReports(tenant, { from, to }),
    dayCheckins(db, tenant, from, to),
  ]);
  const dates = new Set<string>([
    ...(from <= today && today <= to ? [today] : []),
    ...reports.map(report => report.reportDate),
    ...checkins.map(checkin => checkin.reportDate),
    ...taskRows.map(task => taskDay(task, zone)).filter(date => from <= date && date <= to),
  ]);
  return [...dates].sort().reverse().map(date => {
    const onDay = taskRows.filter(task => belongsToDay(task, date, today, zone));
    const answers = reports.filter(report => report.reportDate === date);
    const seen = checkins.filter(checkin => checkin.reportDate === date);
    return {
      date,
      isToday: date === today,
      tasksTotal: onDay.length,
      tasksDone: onDay.filter(task => isFinished(task.status)).length,
      answerCount: answers.length,
      missing: missingDailyReports(answers),
      needsAttention: answers.some(report =>
        report.type === "animal_dead" || report.type === "animal_sick" || (report.type === "stock_needed" && report.answer === true)),
      photoCount: seen.filter(checkin => checkin.photoKey).length,
      workerNames: [...new Set(seen.map(checkin => checkin.workerName))],
    };
  });
}

export async function getDayReport(tenant: TenantContext, date: string) {
  const db = await requireDb();
  const zone = await farmZone(db, tenant);
  const today = farmToday(zone);
  await materializeTasks(tenant, today);
  const [taskRows, reports, checkins] = await Promise.all([
    dayTasks(tenant, date, date, today),
    listReports(tenant, { from: date, to: date }),
    dayCheckins(db, tenant, date, date),
  ]);
  return {
    date,
    isToday: date === today,
    tasks: taskRows.filter(task => belongsToDay(task, date, today, zone)),
    reports,
    missing: missingDailyReports(reports),
    checkins: checkins.map(({ photoKey, ...checkin }) => ({ ...checkin, photoUrl: photoUrl(photoKey) })),
  };
}

/**
 * Starts a day over: the answers go, the tasks go back to not started, and the tablet
 * asks again. A confirmed death stays, as it's the record of why the animal left the herd.
 */
export async function deleteDayReport(
  tx: DbOrTx,
  tenant: TenantContext,
  input: { date: string; ipAddress?: string | null },
) {
  const farmId = requireFarmId(tenant);
  const zone = await farmZone(tx, tenant);
  const today = farmToday(zone);
  const now = new Date();
  const removed = await tx.update(farmReports).set({
    deletedAt: now, deletedBy: tenant.userId, version: sql`${farmReports.version} + 1`,
  }).where(and(
    eq(farmReports.companyId, tenant.companyId),
    eq(farmReports.farmId, farmId),
    eq(farmReports.reportDate, input.date),
    isNull(farmReports.deletedAt),
    isNull(farmReports.confirmedAt),
  )).returning({ id: farmReports.id });

  const candidates = await tx.select().from(tasks).where(and(
    eq(tasks.companyId, tenant.companyId),
    eq(tasks.farmId, farmId),
    isNull(tasks.deletedAt),
    or(
      eq(tasks.dueDate, input.date),
      and(gte(tasks.finishedAt, new Date(`${addDays(input.date, -1)}T00:00:00Z`)), lte(tasks.finishedAt, new Date(`${addDays(input.date, 1)}T23:59:59Z`))),
      input.date === today ? and(lt(tasks.dueDate, today), eq(tasks.status, "started")) : undefined,
    ),
  )).limit(DAY_REPORT_TASK_LIMIT);
  const taskIds = candidates
    .filter(task => task.status !== "todo" && belongsToDay(task, input.date, today, zone))
    .map(task => task.id);
  if (taskIds.length > 0) {
    await tx.update(tasks).set({
      status: "todo",
      startedByWorkerId: null,
      startedAt: null,
      finishedByWorkerId: null,
      finishedAt: null,
      blockedReason: null,
      version: sql`${tasks.version} + 1`,
    }).where(and(eq(tasks.companyId, tenant.companyId), inArray(tasks.id, taskIds)));
  }

  const checkins = await tx.update(workerCheckins).set({ deletedAt: now }).where(and(
    eq(workerCheckins.companyId, tenant.companyId),
    eq(workerCheckins.farmId, farmId),
    eq(workerCheckins.reportDate, input.date),
    isNull(workerCheckins.deletedAt),
  )).returning({ photoKey: workerCheckins.photoKey });

  await createAuditEntry({
    userId: tenant.userId,
    entityType: "dayReport",
    entityId: input.date,
    action: "day_report_delete",
    farmId,
    ipAddress: input.ipAddress ?? undefined,
    metadata: { answers: removed.length, tasksReset: taskIds.length, photos: checkins.filter(row => row.photoKey).length },
  }, tx);
  return {
    answers: removed.length,
    tasksReset: taskIds.length,
    photoKeys: checkins.flatMap(row => row.photoKey ? [row.photoKey] : []),
  };
}

export async function findCheckin(tenant: TenantContext, clientKey: string) {
  const db = await requireDb();
  const [row] = await db.select({ id: workerCheckins.id }).from(workerCheckins).where(and(
    eq(workerCheckins.companyId, tenant.companyId),
    eq(workerCheckins.clientKey, clientKey),
  )).limit(1);
  return row ?? null;
}

/** Records a worker picking their name. Null if a retry of this check-in got there first. */
export async function recordCheckin(
  tenant: TenantContext,
  input: { workerId: number; reportDate?: string | null; takenAt?: string | null; photoKey: string | null; clientKey: string },
) {
  const db = await requireDb();
  const [row] = await db.insert(workerCheckins).values({
    companyId: tenant.companyId,
    farmId: requireFarmId(tenant),
    workerId: input.workerId,
    reportDate: reportDay(input.reportDate, await farmDate(db, tenant)),
    takenAt: tapTime(input.takenAt),
    photoKey: input.photoKey,
    clientKey: input.clientKey,
    createdBy: tenant.userId,
  }).onConflictDoNothing().returning({ id: workerCheckins.id });
  return row ?? null;
}
