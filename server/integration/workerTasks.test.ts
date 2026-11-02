// The task rules that only a real engine can prove: ON CONFLICT generation, the
// partial and expression indexes, row locks, and the FK clearing a single column.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { createTestDb, hasTestDatabase } from "./setup";
import { animalStatusHistory, animalStatuses, animals, auditLog, companyMemberships, notifications } from "../../drizzle/schema";
import { farmReports, tabletAccounts, taskTemplates, tasks, workers } from "../../drizzle/schema.workerTasks";
import { addDays, farmToday, TABLET_BLOCKED, VACCINATION_LOOKBACK_DAYS, WORKER_NOT_ALLOWED } from "../../shared/tasks";
import type { TenantContext } from "../../shared/tenancy";
import { runWithDbTransaction, type DbOrTx } from "../db";
import { revertAuditEntry } from "../revert";
import { sendMissedReportAlerts } from "../tasks/missedReports";
import {
  confirmReportedDeath,
  deleteDayReport,
  findCheckin,
  getDayReport,
  getOwnerOverview,
  getReportStatus,
  getTabletDay,
  listDayReports,
  listReports,
  listWorkers,
  recordCheckin,
  recordTaskAction,
  submitFarmReport,
} from "../tasks/service";
import { createTabletCode, disconnectTablets, getTabletStatus, normalizeTabletCode, redeemTabletCode } from "../tasks/tablet";
import { notATablet } from "../tasks/tabletSeats";
import { generatePublicId } from "../tenancy/publicIds";
import { runWithTenantContext } from "../tenancy/runtime";

const suite = hasTestDatabase ? describe : describe.skip;

suite("worker tasks", () => {
  let db: DbOrTx;
  let pool: pg.Pool;
  const today = farmToday("UTC");

  /** Inserts a row with a publicId and returns its id. */
  async function insert(table: string, values: Record<string, unknown>): Promise<number> {
    const row = { publicId: generatePublicId(), ...values };
    const columns = Object.keys(row).map(column => `"${column}"`).join(", ");
    const params = Object.keys(row).map((_, index) => `$${index + 1}`).join(", ");
    const result = await pool.query(
      `INSERT INTO "${table}" (${columns}) VALUES (${params}) RETURNING id`,
      Object.values(row),
    );
    return result.rows[0].id;
  }

  type Fixture = Awaited<ReturnType<typeof seedCompany>>;

  async function seedCompany() {
    const suffix = randomUUID().slice(0, 8);
    const companyId = await insert("saas_companies", { name: `Farm ${suffix}`, slug: `farm-${suffix}`, lifecycleStatus: "active" });
    const farmId = await insert("saas_farms", { companyId, code: suffix, name: "Main" });
    const member = async (role: string, farmAccessMode: string) => {
      const userId = await insert("saas_users", { openId: randomUUID() });
      const membershipId = await insert("saas_company_memberships", {
        companyId, userId, role, status: "active", farmAccessMode,
      });
      return { userId, membershipId };
    };
    const tablet = await member("worker", "restricted");
    await pool.query(
      `INSERT INTO "saas_farm_memberships" ("companyId", "companyMembershipId", "farmId") VALUES ($1, $2, $3)`,
      [companyId, tablet.membershipId, farmId],
    );
    const owner = await member("owner", "all");
    const supervisor = await member("supervisor", "all");
    const staff = await member("staff", "all");

    const speciesId = await insert("saas_azal_species", { companyId, name: `Sheep ${suffix}` });
    const categoryId = await insert("saas_azal_animal_categories", { companyId, speciesId, name: "Ewe", idPrefix: "EW" });
    const groupId = await insert("saas_azal_groups", { companyId, farmId, groupCode: suffix, name: "Pen A" });
    const statusId = await insert("saas_azal_animal_statuses", { companyId, name: `Active ${suffix}` });
    const vaccineId = await insert("saas_azal_vaccines", { companyId, name: "FMD", validityPeriod: 180 });
    const animal = (tag: string, isActive = true) => insert("saas_azal_animals", {
      companyId, farmId, speciesId, categoryId, groupId, statusId, isActive,
      sex: "female", acquisitionType: "purchased", acquisitionDate: "2026-01-01", birthDate: "2025-01-01", animalId: tag,
    });
    const vaccinate = (animalId: number, nextDueDate: string, boosterDueDate?: string) =>
      insert("saas_azal_vaccination_records", {
        companyId, farmId, animalId, vaccineId, vaccinationDate: "2026-01-01", nextDueDate, boosterDueDate: boosterDueDate ?? null,
      });
    const worker = (name: string) => insert("saas_azal_workers", { companyId, farmId, name });

    const tenant = {
      companyId, companyPublicId: generatePublicId(), companySlug: `farm-${suffix}`,
      companyLifecycleStatus: "active", userId: tablet.userId, membershipId: tablet.membershipId,
      membershipRole: "worker", membershipStatus: "active", authorizationVersion: 1,
      farmAccessMode: "restricted", accessibleFarmIds: [farmId], selectedFarmId: farmId,
      permissionOverrides: {}, sessionId: 1, authenticationLevel: "primary", entitlementVersion: 1,
      requestId: randomUUID(),
    } as unknown as TenantContext;
    return { companyId, farmId, tenant, animal, vaccinate, worker, owner, supervisor, staff };
  }

  const as = <T,>(fixture: Fixture, run: () => Promise<T>) =>
    runWithTenantContext(fixture.tenant, () => runWithDbTransaction(db, run));

  const tap = (fixture: Fixture, taskId: number, action: "start" | "done" | "blocked" | "undo", workerId: number | null) =>
    as(fixture, () => db.transaction(tx =>
      runWithDbTransaction(tx, () => recordTaskAction(tx, fixture.tenant, { taskId, action, workerId, reason: action === "blocked" ? "no_time" : null })),
    ));

  beforeAll(async () => {
    ({ db, pool } = await createTestDb() as unknown as { db: DbOrTx; pool: pg.Pool });
  });
  afterAll(async () => {
    await pool?.end();
  });

  describe("workers", () => {
    it("hides a switched-off worker from the tablet", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      await farm.worker("Omar");
      await db.update(workers).set({ isActive: false }).where(eq(workers.id, ali));
      const day = await as(farm, () => getTabletDay(farm.tenant));
      expect(day.workers.map(worker => worker.name)).toEqual(["Omar"]);
      expect((await as(farm, () => listWorkers(farm.tenant))).map(worker => worker.name)).toEqual(["Omar", "Ali"]);
    });

    it("doesn't turn the tablet's own account into a name", async () => {
      const farm = await seedCompany();
      expect((await as(farm, () => getTabletDay(farm.tenant))).workers).toEqual([]);
    });

    it("refuses a switched-off name, but keeps a tap made before it was switched off", async () => {
      const farm = await seedCompany();
      const omar = await farm.worker("Omar");
      const created = await insert("saas_azal_tasks", {
        companyId: farm.companyId, farmId: farm.farmId, title: "Feed", dueDate: today, source: "manual",
      });
      await db.update(workers).set({ isActive: false }).where(eq(workers.id, omar));
      await expect(tap(farm, created, "start", omar)).rejects.toThrow(WORKER_NOT_ALLOWED);
      // Measured the same way whatever time zone the connection is in.
      const lateTap = new Date().toISOString();
      await expect(as(farm, () => db.transaction(tx => runWithDbTransaction(tx, () =>
        recordTaskAction(tx, farm.tenant, { taskId: created, action: "start", workerId: omar, tappedAt: lateTap })))))
        .rejects.toThrow(WORKER_NOT_ALLOWED);
      const before = new Date(Date.now() - 60_000).toISOString();
      await as(farm, () => db.transaction(tx => runWithDbTransaction(tx, () =>
        recordTaskAction(tx, farm.tenant, { taskId: created, action: "start", workerId: omar, tappedAt: before }))));
      const [row] = await db.select().from(tasks).where(eq(tasks.id, created));
      expect(row.status).toBe("started");
    });
  });

  describe("assigned tasks", () => {
    it("copies a recurring task's worker onto the day's task", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      await insert("saas_azal_task_templates", {
        companyId: farm.companyId, farmId: farm.farmId, title: "Feed", weekdays: 127, assignedWorkerId: ali,
      });
      const day = await as(farm, () => getTabletDay(farm.tenant));
      expect(day.tasks).toMatchObject([{ title: "Feed", assignedWorkerId: ali, assignedName: "Ali" }]);
    });

    it("can't point at another company's worker", async () => {
      const farm = await seedCompany();
      const other = await seedCompany();
      const theirs = await other.worker("Theirs");
      await expect(insert("saas_azal_tasks", {
        companyId: farm.companyId, farmId: farm.farmId, title: "Feed", dueDate: today, source: "manual", assignedWorkerId: theirs,
      })).rejects.toThrow(/tasks_assigned_worker_fk/);
    });
  });

  describe("day reports", () => {
    const addTask = (farm: Fixture, title: string, dueDate = today) => insert("saas_azal_tasks", {
      companyId: farm.companyId, farmId: farm.farmId, title, dueDate, source: "manual",
    });
    const startOver = (farm: Fixture, date: string) =>
      as(farm, () => db.transaction(tx => runWithDbTransaction(tx, () => deleteDayReport(tx, farm.tenant, { date }))));
    const checkIn = (farm: Fixture, workerId: number, clientKey: string, photoKey: string | null = null, reportDate = today) =>
      as(farm, () => recordCheckin(farm.tenant, { workerId, reportDate, takenAt: new Date().toISOString(), photoKey, clientKey }));

    it("has one line per day, always today, and follows task and answer changes", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      const task = await addTask(farm, "Feed");
      const first = await as(farm, () => listDayReports(farm.tenant));
      expect(first.map(line => [line.date, line.isToday, line.tasksDone, line.tasksTotal, line.answerCount])).toEqual([[today, true, 0, 1, 0]]);

      await tap(farm, task, "done", ali);
      await report(farm, { type: "doctor_visit", answer: true, workerId: ali });
      await checkIn(farm, ali, randomUUID(), "photo-key");
      const [line] = await as(farm, () => listDayReports(farm.tenant));
      expect(line).toMatchObject({ tasksDone: 1, tasksTotal: 1, answerCount: 1, photoCount: 1, workerNames: ["Ali"] });
      expect(line.missing).not.toContain("doctor_visit");
    });

    it("deleting a past day moves its one-offs to today and removes its repeating chores", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      const yesterday = addDays(today, -1);
      const oneOff = await addTask(farm, "Fix fence", yesterday);
      const unfinished = await addTask(farm, "Buy salt", yesterday);
      const chore = await insert("saas_azal_tasks", {
        companyId: farm.companyId, farmId: farm.farmId, title: "Feed", dueDate: yesterday, source: "template", sourceKey: `template:1:${yesterday}`,
      });
      await db.update(tasks).set({ status: "done", finishedAt: new Date(`${yesterday}T12:00:00Z`), finishedByWorkerId: ali }).where(eq(tasks.id, oneOff));
      await report(farm, { type: "doctor_visit", answer: true, workerId: ali, reportDate: yesterday });

      expect(await startOver(farm, yesterday)).toMatchObject({ answers: 1, tasksReset: 3 });

      const rows = await db.select().from(tasks).where(inArray(tasks.id, [oneOff, unfinished, chore]));
      const row = (id: number) => rows.find(other => other.id === id)!;
      expect(row(oneOff)).toMatchObject({ status: "todo", dueDate: today, finishedAt: null, finishedByWorkerId: null });
      expect(row(unfinished)).toMatchObject({ status: "todo", dueDate: today });
      expect(row(chore).deletedAt).not.toBeNull();
      // The day's line goes, and the one-offs show as today's, not overdue.
      const lines = await as(farm, () => listDayReports(farm.tenant));
      expect(lines.map(line => line.date)).toEqual([today]);
      expect(lines[0].tasksTotal).toBe(2);
    });

    it("counts a task on the day it was finished, and an open one-off on today as well", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      const yesterday = addDays(today, -1);
      const lateDone = await addTask(farm, "Late", yesterday);
      await tap(farm, lateDone, "done", ali);
      const stillOpen = await addTask(farm, "Open", yesterday);

      const todayReport = await as(farm, () => getDayReport(farm.tenant, today));
      expect(todayReport.tasks.map(task => task.id).sort()).toEqual([lateDone, stillOpen].sort());
      const yesterdayReport = await as(farm, () => getDayReport(farm.tenant, yesterday));
      expect(yesterdayReport.tasks.map(task => task.id)).toEqual([stillOpen]);
    });

    it("shows the photos with the worker's name, and says when there's none", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      await checkIn(farm, ali, randomUUID(), "tenants/x/photo.jpg");
      await checkIn(farm, ali, randomUUID(), null);
      const { checkins } = await as(farm, () => getDayReport(farm.tenant, today));
      expect(checkins.map(row => [row.workerName, row.photoUrl]).sort()).toEqual([
        ["Ali", "/manus-storage/tenants/x/photo.jpg"],
        ["Ali", null],
      ].sort());
    });

    it("keeps one check-in per client key, so a retry stores nothing twice", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      const key = randomUUID();
      expect(await checkIn(farm, ali, key)).not.toBeNull();
      expect(await checkIn(farm, ali, key)).toBeNull();
      expect(await as(farm, () => findCheckin(farm.tenant, key))).not.toBeNull();
      expect((await as(farm, () => getDayReport(farm.tenant, today))).checkins).toHaveLength(1);
    });

    it("starts the day over: tasks to do, answers and photos gone, and the tablet asks again", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      const done = await addTask(farm, "Done");
      const started = await addTask(farm, "Started");
      await tap(farm, done, "done", ali);
      await tap(farm, started, "start", ali);
      await report(farm, { type: "doctor_visit", answer: true, workerId: ali });
      await checkIn(farm, ali, randomUUID(), "photo-key");

      const result = await startOver(farm, today);
      expect(result).toMatchObject({ answers: 1, tasksReset: 2, photoKeys: ["photo-key"] });

      const day = await as(farm, () => getTabletDay(farm.tenant));
      expect(day.tasks.map(task => [task.status, task.startedByName, task.finishedByName])).toEqual([
        ["todo", null, null],
        ["todo", null, null],
      ]);
      expect(day.reports).toEqual([]);
      const detail = await as(farm, () => getDayReport(farm.tenant, today));
      expect(detail.checkins).toEqual([]);
      expect(detail.missing).toContain("doctor_visit");

      // Answerable again, and doable again.
      await report(farm, { type: "doctor_visit", answer: false, workerId: ali });
      await tap(farm, done, "done", ali);
      expect((await as(farm, () => getDayReport(farm.tenant, today))).reports).toHaveLength(1);
    });

    it("leaves other days and other companies alone", async () => {
      const farm = await seedCompany();
      const other = await seedCompany();
      const ali = await farm.worker("Ali");
      const theirWorker = await other.worker("Omar");
      const yesterday = addDays(today, -1);
      const theirs = await addTask(other, "Theirs");
      await tap(other, theirs, "done", theirWorker);
      const earlier = await addTask(farm, "Earlier", yesterday);
      await db.update(tasks).set({ status: "done", finishedByWorkerId: ali, finishedAt: new Date(`${yesterday}T12:00:00Z`) }).where(eq(tasks.id, earlier));

      await startOver(farm, today);
      const rows = await db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(inArray(tasks.id, [theirs, earlier]));
      expect(rows.every(row => row.status === "done")).toBe(true);
    });

    it("keeps a confirmed death when the day starts over", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      await farm.animal("EW-1");
      const sent = await report(farm, { type: "animal_dead", animalTag: "EW-1", workerId: ali });
      await db.update(farmReports).set({ confirmedAt: new Date() }).where(eq(farmReports.id, sent.id));
      const result = await startOver(farm, today);
      expect(result.answers).toBe(0);
      expect((await as(farm, () => getDayReport(farm.tenant, today))).reports).toHaveLength(1);
    });
  });

  describe("connecting a tablet", () => {
    const slug = async (farm: Fixture) => (await pool.query(`SELECT slug FROM "saas_companies" WHERE id = $1`, [farm.companyId])).rows[0].slug as string;
    const newCode = (farm: Fixture) => as(farm, () => createTabletCode(farm.tenant));
    const redeem = (companySlug: string, code: string) =>
      runWithDbTransaction(db, () => redeemTabletCode(companySlug, normalizeTabletCode(code)!));

    beforeAll(() => {
      process.env.OAUTH_STATE_SECRET ??= "integration-only-state-secret-0123456789";
    });

    it("signs a tablet in once with a code, as a worker on that farm only, with no email", async () => {
      const farm = await seedCompany();
      const { code } = await newCode(farm);
      expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
      const user = await redeem(await slug(farm), code);
      expect(user).toMatchObject({ email: null, loginMethod: "tablet_code" });
      const memberships = await pool.query(
        `SELECT m.role, m.status, m."farmAccessMode", f."farmId" FROM "saas_company_memberships" m
         JOIN "saas_farm_memberships" f ON f."companyMembershipId" = m.id WHERE m."userId" = $1`, [user!.id]);
      expect(memberships.rows).toEqual([{ role: "worker", status: "active", farmAccessMode: "restricted", farmId: farm.farmId }]);
      expect((await as(farm, () => getTabletStatus(farm.tenant))).connected).toBe(true);
      // Single use, even on the right address.
      expect(await redeem(await slug(farm), code)).toBeNull();
    });

    it("stores only a hash of the code", async () => {
      const farm = await seedCompany();
      const { code } = await newCode(farm);
      const { rows } = await pool.query(`SELECT "codeHash" FROM "saas_azal_tablet_accounts" WHERE "companyId" = $1`, [farm.companyId]);
      expect(rows[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].codeHash).not.toContain(code.replace("-", ""));
    });

    it("refuses an expired code, a replaced code, and another company's address", async () => {
      const farm = await seedCompany();
      const other = await seedCompany();
      const first = await newCode(farm);
      const second = await newCode(farm);
      expect(await redeem(await slug(farm), first.code)).toBeNull();
      expect(await redeem(await slug(other), second.code)).toBeNull();
      await db.update(tabletAccounts).set({ codeExpiresAt: new Date(Date.now() - 60_000) }).where(eq(tabletAccounts.companyId, farm.companyId));
      expect(await redeem(await slug(farm), second.code)).toBeNull();
    });

    it("reuses one account for every tablet, and disconnecting ends its sessions", async () => {
      const farm = await seedCompany();
      const one = await redeem(await slug(farm), (await newCode(farm)).code);
      const two = await redeem(await slug(farm), (await newCode(farm)).code);
      expect(two!.id).toBe(one!.id);
      await as(farm, () => disconnectTablets(farm.tenant));
      const { rows } = await pool.query(`SELECT "authVersion" FROM "saas_users" WHERE id = $1`, [one!.id]);
      expect(rows[0].authVersion).toBeGreaterThan(one!.authVersion);
      expect((await as(farm, () => getTabletStatus(farm.tenant))).connected).toBe(false);
      const membership = await pool.query(`SELECT status FROM "saas_company_memberships" WHERE "userId" = $1`, [one!.id]);
      expect(membership.rows[0].status).toBe("suspended");
      // An old code can't undo a disconnect, a new one can.
      const again = await redeem(await slug(farm), (await newCode(farm)).code);
      expect(again!.id).toBe(one!.id);
    });

    it("won't bring back a tablet taken away in Admin", async () => {
      const farm = await seedCompany();
      const user = await redeem(await slug(farm), (await newCode(farm)).code);
      const { code } = await newCode(farm);
      await pool.query(`UPDATE "saas_company_memberships" SET status = 'removed' WHERE "userId" = $1`, [user!.id]);
      // A code made before it was taken away is dead, and no new one can be made.
      expect(await redeem(await slug(farm), code)).toBeNull();
      await expect(newCode(farm)).rejects.toThrow(TABLET_BLOCKED);
    });

    it("won't bring back a tablet suspended in Admin, even after a disconnect", async () => {
      const farm = await seedCompany();
      const user = await redeem(await slug(farm), (await newCode(farm)).code);
      const { code } = await newCode(farm);
      await pool.query(`UPDATE "saas_company_memberships" SET status = 'suspended' WHERE "userId" = $1`, [user!.id]);
      expect(await redeem(await slug(farm), code)).toBeNull();
      await as(farm, () => disconnectTablets(farm.tenant));
      await expect(newCode(farm)).rejects.toThrow(TABLET_BLOCKED);
      const { rows } = await pool.query(`SELECT status FROM "saas_company_memberships" WHERE "userId" = $1`, [user!.id]);
      expect(rows[0].status).toBe("suspended");
    });

    it("doesn't take a seat, while a worker with their own login does", async () => {
      const farm = await seedCompany();
      const seats = async () => {
        const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(companyMemberships)
          .where(and(eq(companyMemberships.companyId, farm.companyId), notATablet));
        return Number(row.count);
      };
      const before = await seats();
      await redeem(await slug(farm), (await newCode(farm)).code);
      expect(await seats()).toBe(before);
      const userId = await insert("saas_users", { openId: `person_${randomUUID()}`, name: "Person" });
      await insert("saas_company_memberships", { companyId: farm.companyId, userId, role: "worker", status: "active" });
      expect(await seats()).toBe(before + 1);
    });

    it("normalizes what people type", () => {
      expect(normalizeTabletCode(" abcd-2345 ")).toBe("ABCD2345");
      expect(normalizeTabletCode("short")).toBeNull();
      expect(normalizeTabletCode({ code: "ABCD2345" })).toBeNull();
    });
  });

  it("generates each repeating task and due vaccination exactly once, even concurrently", async () => {
    const farm = await seedCompany();
    const due = await farm.animal(`DUE-${farm.companyId}`);
    await farm.vaccinate(due, today);
    await db.insert(taskTemplates).values({
      publicId: generatePublicId(), companyId: farm.companyId, farmId: farm.farmId, title: "Feed Pen A",
    });

    const days = await Promise.all([1, 2, 3, 4].map(() => as(farm, () => getTabletDay(farm.tenant))));
    await as(farm, () => getTabletDay(farm.tenant));

    expect(days[0].date).toBe(today);
    const rows = await db.select().from(tasks).where(eq(tasks.companyId, farm.companyId));
    expect(rows.map(row => row.source).sort()).toEqual(["template", "vaccination"]);
  });

  it("skips sold animals, old alerts and days the chore isn't scheduled", async () => {
    const farm = await seedCompany();
    const sold = await farm.animal(`SOLD-${farm.companyId}`, false);
    await farm.vaccinate(sold, today);
    const old = await farm.animal(`OLD-${farm.companyId}`);
    await farm.vaccinate(old, addDays(today, -(VACCINATION_LOOKBACK_DAYS + 1)));
    const future = await farm.animal(`FUT-${farm.companyId}`);
    await farm.vaccinate(future, addDays(today, 1));
    const otherDay = 1 << new Date(`${addDays(today, 1)}T00:00:00Z`).getUTCDay();
    await db.insert(taskTemplates).values({
      publicId: generatePublicId(), companyId: farm.companyId, farmId: farm.farmId, title: "Tomorrow only", weekdays: otherDay,
    });

    const day = await as(farm, () => getTabletDay(farm.tenant));
    expect(day.tasks).toEqual([]);
  });

  it("keeps next and booster doses apart, and shows the animal tag", async () => {
    const farm = await seedCompany();
    const tag = `TAG-${farm.companyId}`;
    await farm.vaccinate(await farm.animal(tag), today, today);
    const day = await as(farm, () => getTabletDay(farm.tenant));
    expect(day.tasks).toHaveLength(2);
    expect(day.tasks[0]).toMatchObject({ title: "FMD", animalTag: tag, source: "vaccination", status: "todo" });
  });

  it("doesn't bring back a generated task that was done or deleted", async () => {
    const farm = await seedCompany();
    const animal = await farm.animal(`KEEP-${farm.companyId}`);
    await farm.vaccinate(animal, today);
    const ali = await farm.worker("Ali");
    const [task] = (await as(farm, () => getTabletDay(farm.tenant))).tasks;
    await tap(farm, task.id, "done", ali);
    await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, task.id));
    expect((await as(farm, () => getTabletDay(farm.tenant))).tasks).toEqual([]);
  });

  it("carries unfinished one-offs and vaccinations over, but not repeating chores", async () => {
    const farm = await seedCompany();
    const yesterday = addDays(today, -1);
    const add = (title: string, source: "manual" | "template", status: "todo" | "done" = "todo") =>
      db.insert(tasks).values({
        publicId: generatePublicId(), companyId: farm.companyId, farmId: farm.farmId,
        title, source, status, dueDate: yesterday, sourceKey: source === "manual" ? null : randomUUID(),
      });
    await add("Fix fence", "manual");
    const record = await farm.vaccinate(await farm.animal(`LATE-${farm.companyId}`), yesterday);
    await db.insert(tasks).values({
      publicId: generatePublicId(), companyId: farm.companyId, farmId: farm.farmId, title: "Old vaccine",
      source: "vaccination", dueDate: yesterday, sourceKey: `vaccination:${record}:next:${yesterday}`,
    });
    await add("Missed chore", "template");
    await add("Finished yesterday", "manual", "done");

    const tablet = await as(farm, () => getTabletDay(farm.tenant));
    expect(tablet.tasks.map(task => task.title).sort()).toEqual(["Fix fence", "Old vaccine"]);
    // The owner does still see the missed chore.
    const owner = await as(farm, () => getOwnerOverview(farm.tenant));
    expect(owner.tasks.map(task => task.title)).toContain("Missed chore");
    expect(owner.tasks.map(task => task.title)).not.toContain("Finished yesterday");
  });

  it("isolates companies", async () => {
    const mine = await seedCompany();
    const theirs = await seedCompany();
    await db.insert(tasks).values({
      publicId: generatePublicId(), companyId: theirs.companyId, farmId: theirs.farmId, title: "Theirs", dueDate: today,
    });
    const [theirTask] = await db.select().from(tasks).where(eq(tasks.companyId, theirs.companyId));
    const theirWorker = await theirs.worker("Omar");

    expect((await as(mine, () => getTabletDay(mine.tenant))).tasks).toEqual([]);
    await expect(tap(mine, theirTask.id, "start", null)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // A worker id from another company can't be used either.
    await db.insert(tasks).values({
      publicId: generatePublicId(), companyId: mine.companyId, farmId: mine.farmId, title: "Mine", dueDate: today,
    });
    const [myTask] = await db.select().from(tasks).where(eq(tasks.companyId, mine.companyId));
    await expect(tap(mine, myTask.id, "start", theirWorker)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("notifies only owners, admins and supervisors, by name, and only for real changes", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    await db.insert(tasks).values({
      publicId: generatePublicId(), companyId: farm.companyId, farmId: farm.farmId, title: "Feed Pen A", dueDate: today,
    });
    const [task] = await db.select().from(tasks).where(eq(tasks.companyId, farm.companyId));

    await tap(farm, task.id, "start", ali);
    await expect(tap(farm, task.id, "start", ali)).resolves.toMatchObject({ changed: false });

    const rows = await db.select().from(notifications).where(eq(notifications.companyId, farm.companyId));
    expect(rows.map(row => row.userId).sort()).toEqual([farm.owner.userId, farm.supervisor.userId].sort());
    expect(rows[0]).toMatchObject({ alertType: "task_started", message: "Ali started Feed Pen A" });

    await tap(farm, task.id, "done", null);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(row).toMatchObject({ status: "done", startedByWorkerId: ali, finishedByWorkerId: ali, version: 3 });
  });

  it("requires a name unless the task already has one", async () => {
    const farm = await seedCompany();
    await db.insert(tasks).values({
      publicId: generatePublicId(), companyId: farm.companyId, farmId: farm.farmId, title: "Clean", dueDate: today,
    });
    const [task] = await db.select().from(tasks).where(eq(tasks.companyId, farm.companyId));
    await expect(tap(farm, task.id, "done", null)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a second worker with the same name, ignoring case", async () => {
    const farm = await seedCompany();
    await farm.worker("Ali");
    await expect(farm.worker("ALI")).rejects.toMatchObject({ code: "23505" });
  });

  it("keeps the task but clears the animal when a restore deletes the animal", async () => {
    const farm = await seedCompany();
    const animal = await farm.animal(`GONE-${farm.companyId}`);
    await db.insert(tasks).values({
      publicId: generatePublicId(), companyId: farm.companyId, farmId: farm.farmId, title: "Check", dueDate: today, animalId: animal,
    });
    await db.delete(animals).where(and(eq(animals.companyId, farm.companyId), eq(animals.id, animal)));
    const [row] = await db.select().from(tasks).where(eq(tasks.companyId, farm.companyId));
    expect(row).toMatchObject({ animalId: null, companyId: farm.companyId });
  });

  const report = (fixture: Fixture, input: Parameters<typeof submitFarmReport>[2]) =>
    as(fixture, () => db.transaction(tx =>
      runWithDbTransaction(tx, () => submitFarmReport(tx, fixture.tenant, input)),
    ));

  it("keeps one yes/no answer a day, and only notifies when it changes", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const first = await report(farm, { type: "doctor_visit", answer: true, workerId: ali });
    const again = await report(farm, { type: "doctor_visit", answer: true, workerId: ali });
    const changed = await report(farm, { type: "doctor_visit", answer: false, workerId: ali });
    expect(again).toMatchObject({ id: first.id, changed: false });
    expect(changed).toMatchObject({ id: first.id, changed: true });

    const rows = await db.select().from(farmReports).where(eq(farmReports.companyId, farm.companyId));
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toBe(false);

    const sent = await db.select().from(notifications).where(and(
      eq(notifications.companyId, farm.companyId), eq(notifications.userId, farm.owner.userId),
    ));
    expect(sent).toHaveLength(2);
  });

  it("records what stock is needed, and a changed list is a new answer", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const need = (stockKinds: ("feed" | "medicine" | "other")[], itemName: string | null = null) =>
      report(farm, { type: "stock_needed", answer: true, stockKinds, itemName, workerId: ali });

    await need(["medicine", "feed"]);
    expect(await need(["feed", "medicine"])).toMatchObject({ changed: false });
    expect(await need(["feed", "other"], "Straw")).toMatchObject({ changed: true });

    const [row] = await db.select().from(farmReports).where(eq(farmReports.companyId, farm.companyId));
    expect(row).toMatchObject({ stockKinds: ["feed", "other"], itemName: "Straw" });
    const sent = await db.select().from(notifications).where(and(
      eq(notifications.companyId, farm.companyId), eq(notifications.userId, farm.owner.userId),
    ));
    expect(sent.at(-1)?.message).toContain("feed, Straw");

    await report(farm, { type: "stock_needed", answer: false, workerId: ali });
    const [cleared] = await db.select().from(farmReports).where(eq(farmReports.companyId, farm.companyId));
    expect(cleared).toMatchObject({ answer: false, stockKinds: null, itemName: null });
  });

  it("settles concurrent answers on one row", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    await Promise.all([true, false, true, false].map(answer => report(farm, { type: "doctor_visit", answer, workerId: ali })));
    const rows = await db.select().from(farmReports).where(eq(farmReports.companyId, farm.companyId));
    expect(rows).toHaveLength(1);
  });

  const confirmDeath = (fixture: Fixture, reportId: number, animalId?: number) =>
    as(fixture, () => db.transaction(tx =>
      runWithDbTransaction(tx, async () => {
        const [listed] = (await listReports(fixture.tenant)).filter(report => report.id === reportId);
        return confirmReportedDeath(tx, fixture.tenant, { reportId, animalId: animalId ?? listed?.matchedAnimalId ?? 0 });
      }),
    ));

  it("exits the animal only when the owner confirms, creating the status once", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const tag = `EW-${farm.companyId}`;
    const first = await farm.animal(tag);
    const second = await farm.animal(`RM-9${farm.companyId}`);
    await db.insert(tasks).values([
      { publicId: generatePublicId(), companyId: farm.companyId, farmId: farm.farmId, title: "Open", dueDate: today, animalId: first },
      { publicId: generatePublicId(), companyId: farm.companyId, farmId: farm.farmId, title: "Done", dueDate: today, animalId: first, status: "done" },
    ]);

    const one = await report(farm, { type: "animal_dead", animalTag: String(farm.companyId), workerId: ali });
    const before = await db.select().from(animals).where(eq(animals.id, first));
    expect(before[0].isActive).toBe(true);

    expect(await confirmDeath(farm, one.id)).toEqual({ changed: true });
    expect(await confirmDeath(farm, one.id)).toEqual({ changed: false });

    const [dead] = await db.select().from(animals).where(eq(animals.id, first));
    expect(dead).toMatchObject({ isActive: false, exitReason: "dead", exitDate: today });
    const [listed] = await as(farm, () => listReports(farm.tenant));
    expect(listed).toMatchObject({ animalId: first, matchedAnimalId: first, matchedAnimalTag: tag, matchedAnimalActive: false });
    const statuses = await db.select().from(animalStatuses).where(and(eq(animalStatuses.companyId, farm.companyId), eq(animalStatuses.name, "Dead")));
    expect(statuses).toHaveLength(1);
    expect(statuses[0].isExitStatus).toBe(true);
    expect(dead.statusId).toBe(statuses[0].id);

    const history = await db.select().from(animalStatusHistory).where(eq(animalStatusHistory.animalId, first));
    expect(history.some(row => row.newStatusId === statuses[0].id)).toBe(true);

    const left = await db.select().from(tasks).where(and(eq(tasks.companyId, farm.companyId), eq(tasks.animalId, first)));
    expect(left.find(task => task.title === "Open")?.deletedAt).not.toBeNull();
    expect(left.find(task => task.title === "Done")?.deletedAt).toBeNull();

    const two = await report(farm, { type: "animal_dead", animalTag: `RM-9${farm.companyId}`, workerId: ali });
    await confirmDeath(farm, two.id);
    const [other] = await db.select().from(animals).where(eq(animals.id, second));
    expect(other.statusId).toBe(statuses[0].id);
  });

  it("can be undone from the audit log, like any other exit", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const tag = `U${farm.companyId}`;
    const animal = await farm.animal(tag);
    const [original] = await db.select().from(animals).where(eq(animals.id, animal));
    const sent = await report(farm, { type: "animal_dead", animalTag: tag, workerId: ali });
    await confirmDeath(farm, sent.id);

    const [entry] = await db.select().from(auditLog).where(and(
      eq(auditLog.companyId, farm.companyId), eq(auditLog.action, "exit"), eq(auditLog.entityId, String(animal)),
    ));
    await as(farm, () => revertAuditEntry(entry.id, farm.tenant.userId, async () => {}));

    const [back] = await db.select().from(animals).where(eq(animals.id, animal));
    expect(back).toMatchObject({ isActive: true, statusId: original.statusId, exitDate: null, exitReason: null });
    const listed = await as(farm, () => listReports(farm.tenant));
    expect(listed[0]).toMatchObject({ matchedAnimalActive: true });
    expect(listed[0].confirmedAt).not.toBeNull();
  });

  it("uses the farm's own death status when it has one", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const own = await insert("saas_azal_animal_statuses", { companyId: farm.companyId, name: "نفوق", isExitStatus: true });
    const tag = `T${farm.companyId}`;
    const animal = await farm.animal(tag);
    const sent = await report(farm, { type: "animal_dead", animalTag: tag, workerId: ali });
    await confirmDeath(farm, sent.id);
    const [dead] = await db.select().from(animals).where(eq(animals.id, animal));
    expect(dead.statusId).toBe(own);
  });

  it("refuses to confirm with no matching animal, one already gone, or another company's report", async () => {
    const farm = await seedCompany();
    const other = await seedCompany();
    const ali = await farm.worker("Ali");
    const nope = await report(farm, { type: "animal_dead", animalTag: "NOPE", workerId: ali });
    await expect(confirmDeath(farm, nope.id)).rejects.toMatchObject({ message: "ANIMAL_NOT_MATCHED" });

    const tag = `G${farm.companyId}`;
    await farm.animal(tag);
    const a = await report(farm, { type: "animal_dead", animalTag: tag, workerId: ali });
    const b = await report(farm, { type: "animal_dead", animalTag: tag, workerId: ali });
    await confirmDeath(farm, a.id);
    await expect(confirmDeath(farm, b.id)).rejects.toMatchObject({ message: "ANIMAL_ALREADY_OUT" });
    await expect(confirmDeath(other, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("won't confirm a report that isn't a death", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const tag = `S${farm.companyId}`;
    const animal = await farm.animal(tag);
    const sick = await report(farm, { type: "animal_sick", animalTag: tag, workerId: ali });
    await expect(confirmDeath(farm, sick.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [row] = await db.select().from(animals).where(eq(animals.id, animal));
    expect(row.isActive).toBe(true);
  });

  it("records a death without touching the animal, and matches the tag for the owner", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const tag = `D${farm.companyId}`;
    const animal = await farm.animal(tag);
    await report(farm, { type: "animal_dead", animalTag: tag, workerId: ali });
    await report(farm, { type: "animal_sick", animalTag: "NOPE", workerId: ali });

    const [row] = await db.select().from(animals).where(and(eq(animals.companyId, farm.companyId), eq(animals.id, animal)));
    expect(row.isActive).toBe(true);

    const listed = await as(farm, () => listReports(farm.tenant));
    expect(listed.find(entry => entry.animalTag === tag)?.matchedAnimalId).toBe(animal);
    expect(listed.find(entry => entry.animalTag === "NOPE")?.matchedAnimalId).toBeNull();
  });

  it("keeps the price off the tablet and shows it to the owner", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    await report(farm, { type: "purchase", purchaseKind: "medicine", itemName: "Penicillin", amount: 150.5, workerId: ali });

    const day = await as(farm, () => getTabletDay(farm.tenant));
    expect(day.reports).toHaveLength(1);
    expect(JSON.stringify(day.reports)).not.toContain("150");
    const listed = await as(farm, () => listReports(farm.tenant));
    expect(Number(listed[0].amount)).toBe(150.5);
  });

  it("refuses a worker from another farm", async () => {
    const farm = await seedCompany();
    const other = await seedCompany();
    const stranger = await other.worker("Stranger");
    await expect(report(farm, { type: "doctor_visit", answer: true, workerId: stranger }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps a task finished today on the list even if it was due earlier", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const id = await insert("saas_azal_tasks", {
      companyId: farm.companyId, farmId: farm.farmId, title: "Fix fence", source: "manual", dueDate: addDays(today, -3),
    });
    await tap(farm, id, "done", ali);
    const tablet = await as(farm, () => getTabletDay(farm.tenant));
    expect(tablet.tasks.find(task => task.id === id)?.status).toBe("done");
    const owner = await as(farm, () => getOwnerOverview(farm.tenant));
    expect(owner.tasks.find(task => task.id === id)?.finishedByName).toBe("Ali");
  });

  it("lets the owner reach an open one-off however old it is", async () => {
    const farm = await seedCompany();
    const id = await insert("saas_azal_tasks", {
      companyId: farm.companyId, farmId: farm.farmId, title: "Very old", source: "manual", dueDate: addDays(today, -40),
    });
    const owner = await as(farm, () => getOwnerOverview(farm.tenant));
    expect(owner.tasks.map(task => task.id)).toContain(id);
  });

  it("drops a vaccination task once it's no longer due", async () => {
    const farm = await seedCompany();
    const animal = await farm.animal(`GONE-${farm.companyId}`);
    const record = await farm.vaccinate(animal, today);
    expect((await as(farm, () => getTabletDay(farm.tenant))).tasks).toHaveLength(1);

    await pool.query(`UPDATE "saas_azal_vaccination_records" SET "isCompleted" = true WHERE id = $1`, [record]);
    expect((await as(farm, () => getTabletDay(farm.tenant))).tasks).toHaveLength(0);
  });

  it("brings a retired vaccination task back when it's due again", async () => {
    const farm = await seedCompany();
    const animal = await farm.animal(`BACK-${farm.companyId}`);
    const record = await farm.vaccinate(animal, today);
    await as(farm, () => getTabletDay(farm.tenant));
    await pool.query(`UPDATE "saas_azal_vaccination_records" SET "isCompleted" = true WHERE id = $1`, [record]);
    await as(farm, () => getTabletDay(farm.tenant));
    await pool.query(`UPDATE "saas_azal_vaccination_records" SET "isCompleted" = false WHERE id = $1`, [record]);
    expect((await as(farm, () => getTabletDay(farm.tenant))).tasks).toHaveLength(1);
  });

  it("refuses to mark an animal dead on a report older than its arrival", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const tag = `NEW-${farm.companyId}`;
    const animal = await farm.animal(tag);
    await pool.query(`UPDATE "saas_azal_animals" SET "acquisitionDate" = $1 WHERE id = $2`, [today, animal]);
    const sent = await report(farm, { type: "animal_dead", animalTag: tag, workerId: ali, reportDate: addDays(today, -2) });
    await expect(confirmDeath(farm, sent.id)).rejects.toMatchObject({ message: "REPORT_BEFORE_ANIMAL" });
  });

  it("records an offline tap at the time it happened", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const id = await insert("saas_azal_tasks", {
      companyId: farm.companyId, farmId: farm.farmId, title: "Feed", source: "manual", dueDate: today,
    });
    const tappedAt = new Date(Date.now() - 3 * 60 * 60 * 1_000).toISOString();
    await as(farm, () => db.transaction(tx => runWithDbTransaction(tx, () =>
      recordTaskAction(tx, farm.tenant, { taskId: id, action: "done", workerId: ali, tappedAt }))));
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
    expect(row.finishedAt?.toISOString().slice(0, 16)).toBe(tappedAt.slice(0, 16));
  });

  it("won't exit a different animal than the one the owner was shown", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    const shown = await farm.animal(`EW-${farm.companyId}142`);
    const sent = await report(farm, { type: "animal_dead", animalTag: `${farm.companyId}142`, workerId: ali });
    await expect(confirmDeath(farm, sent.id, shown + 1)).rejects.toMatchObject({ message: "ANIMAL_MATCH_CHANGED" });
    const [animal] = await db.select().from(animals).where(eq(animals.id, shown));
    expect(animal.isActive).toBe(true);
  });

  it("reuses a switched-off Dead status", async () => {
    const farm = await seedCompany();
    const ali = await farm.worker("Ali");
    await insert("saas_azal_animal_statuses", { companyId: farm.companyId, name: "Dead", isExitStatus: true, isActive: false });
    const tag = `DEAD-${farm.companyId}`;
    await farm.animal(tag);
    const sent = await report(farm, { type: "animal_dead", animalTag: tag, workerId: ali });
    expect(await confirmDeath(farm, sent.id)).toEqual({ changed: true });
  });

  describe("daily report history", () => {
    const lastHour = new Date(`${today}T23:10:00Z`);
    const missedAlerts = (fixture: Fixture) => db.select().from(notifications).where(and(
      eq(notifications.companyId, fixture.companyId),
      eq(notifications.alertType, "task_report_missing"),
    ));
    const check = (now = lastHour) => runWithDbTransaction(db, () => sendMissedReportAlerts(now));

    it("finds reports in a date range, and keeps them past the default window", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      const old = addDays(today, -60);
      await insert("saas_azal_farm_reports", {
        companyId: farm.companyId, farmId: farm.farmId, workerId: ali, type: "doctor_visit", answer: true, reportDate: old,
      });
      expect(await as(farm, () => listReports(farm.tenant))).toHaveLength(0);
      const found = await as(farm, () => listReports(farm.tenant, { from: addDays(old, -1), to: addDays(old, 1) }));
      expect(found.map(row => row.reportDate)).toEqual([old]);
    });

    it("asks again after a delete, and accepts the new answer", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      const sent = await report(farm, { type: "doctor_visit", answer: true, workerId: ali });
      await db.update(farmReports).set({ deletedAt: new Date() }).where(eq(farmReports.id, sent.id));

      expect((await as(farm, () => getTabletDay(farm.tenant))).reports).toHaveLength(0);
      expect((await as(farm, () => getReportStatus(farm.tenant)))?.missing).toContain("doctor_visit");

      await report(farm, { type: "doctor_visit", answer: false, workerId: ali });
      const day = await as(farm, () => getTabletDay(farm.tenant));
      expect(day.reports).toMatchObject([{ type: "doctor_visit", answer: false }]);
      expect((await as(farm, () => getReportStatus(farm.tenant)))?.missing).not.toContain("doctor_visit");
    });

    it("alerts the owner's side once when the day ends without a report", async () => {
      const farm = await seedCompany();
      await farm.worker("Ali");
      await check();
      await check();
      const alerts = await missedAlerts(farm);
      expect(alerts.map(alert => alert.userId).sort()).toEqual([farm.owner.userId, farm.supervisor.userId].sort());
      expect(alerts[0]).toMatchObject({ priority: "high", relatedEntityType: "farm_report" });
      expect(alerts[0].message).toContain("Ali didn't send");
      expect(alerts[0].params).toMatchObject({ date: today, missing: ["doctor_visit", "stock_needed"] });
    });

    it("stays quiet before the last hour, when reported, or with no workers", async () => {
      const early = await seedCompany();
      await early.worker("Ali");
      await check(new Date(`${today}T12:00:00Z`));
      expect(await missedAlerts(early)).toHaveLength(0);

      const reported = await seedCompany();
      const ali = await reported.worker("Ali");
      await report(reported, { type: "doctor_visit", answer: false, workerId: ali });
      await report(reported, { type: "stock_needed", answer: false, workerId: ali });
      const noTablet = await seedCompany();
      await check();
      expect(await missedAlerts(reported)).toHaveLength(0);
      expect(await missedAlerts(noTablet)).toHaveLength(0);
    });

    it("counts a deleted report as not sent", async () => {
      const farm = await seedCompany();
      const ali = await farm.worker("Ali");
      await report(farm, { type: "stock_needed", answer: false, workerId: ali });
      const sent = await report(farm, { type: "doctor_visit", answer: false, workerId: ali });
      await db.update(farmReports).set({ deletedAt: new Date() }).where(eq(farmReports.id, sent.id));
      await check();
      const [alert] = await missedAlerts(farm);
      expect(alert.params).toMatchObject({ missing: ["doctor_visit"] });
    });
  });

  it("bumps updatedAt through the trigger", async () => {
    const farm = await seedCompany();
    const id = await farm.worker("Sami");
    await pool.query(`UPDATE "saas_azal_workers" SET "updatedAt" = '2020-01-01' WHERE id = $1`, [id]);
    await db.update(workers).set({ name: "Samir" }).where(eq(workers.id, id));
    const { rows } = await pool.query(`SELECT "updatedAt" > '2021-01-01' AS fresh FROM "saas_azal_workers" WHERE id = $1`, [id]);
    expect(rows[0].fresh).toBe(true);
  });

  it("has every role enum accepting the new value", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE e.enumlabel = 'worker'`,
    );
    expect(rows[0].n).toBe(5);
  });
});
