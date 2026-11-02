import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { companyMemberships, farmMemberships, farms, users } from "../../drizzle/schema";
import { workers } from "../../drizzle/schema.workerTasks";
import type { TenantContext } from "../../shared/tenancy";
import { getDb } from "../db";
import { generatePublicId } from "../tenancy/publicIds";

const MAX_NAME_LENGTH = 80;

export type WorkerAccount = { userId: number; name: string | null; email: string | null };
type RosterRow = { id: number; userId: number | null; name: string; isActive: boolean; loginGone: boolean };

function fitted(name: string, suffix = "") {
  return `${name.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
}

/**
 * What it takes to bring a farm's worker list in line with its worker logins. A name
 * already typed by the owner is the same person, so it's linked rather than repeated.
 * Names must stay unique on the farm, so a second "Ali" is told apart by their email.
 */
export function planWorkerSync(accounts: readonly WorkerAccount[], roster: readonly RosterRow[]) {
  const byName = new Map(roster.map(row => [row.name.toLowerCase(), row]));
  const linked = new Set(roster.map(row => row.userId));
  const link: Array<{ id: number; userId: number }> = [];
  const create: Array<{ userId: number; name: string }> = [];

  for (const account of accounts) {
    if (linked.has(account.userId)) continue;
    const emailName = account.email?.split("@")[0]?.trim();
    const name = fitted(account.name?.trim() || emailName || `Worker ${account.userId}`);
    const sameName = byName.get(name.toLowerCase());
    if (sameName && sameName.userId === null) {
      link.push({ id: sameName.id, userId: account.userId });
      byName.set(name.toLowerCase(), { ...sameName, userId: account.userId });
      continue;
    }
    const candidates = [name, ...(emailName ? [fitted(name, ` (${emailName})`)] : []), fitted(name, ` #${account.userId}`)];
    const free = candidates.find(candidate => !byName.has(candidate.toLowerCase())) ?? candidates.at(-1)!;
    create.push({ userId: account.userId, name: free });
    byName.set(free.toLowerCase(), { id: 0, userId: account.userId, name: free, isActive: true, loginGone: false });
  }

  const current = new Set(accounts.map(account => account.userId));
  const retire = roster.filter(row => row.userId !== null && row.isActive && !current.has(row.userId));
  const restore = roster.filter(row => row.loginGone && row.userId !== null && current.has(row.userId));
  return { link, create, retire, restore };
}

/**
 * Runs when the list is read, like task generation, so a login added in Admin shows
 * up without Admin having to know about farms' task lists. Repeat runs change nothing,
 * and a linked worker the owner switched off stays off because their row already exists.
 */
export async function syncAccountWorkers(tenant: TenantContext): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const farmIds = tenant.selectedFarmId !== null
    ? [tenant.selectedFarmId]
    : tenant.accessibleFarmIds === "all"
      ? (await db.select({ id: farms.id }).from(farms)
        .where(and(eq(farms.companyId, tenant.companyId), isNull(farms.deletedAt)))).map(farm => farm.id)
      : tenant.accessibleFarmIds;
  for (const farmId of farmIds) {
    const [accounts, roster] = await Promise.all([
      db.select({ userId: companyMemberships.userId, name: users.name, email: users.email })
        .from(companyMemberships)
        .innerJoin(users, eq(users.id, companyMemberships.userId))
        .leftJoin(farmMemberships, and(
          eq(farmMemberships.companyMembershipId, companyMemberships.id),
          eq(farmMemberships.farmId, farmId),
        ))
        .where(and(
          eq(companyMemberships.companyId, tenant.companyId),
          eq(companyMemberships.role, "worker"),
          eq(companyMemberships.status, "active"),
          or(eq(companyMemberships.farmAccessMode, "all"), isNotNull(farmMemberships.farmId)),
        )),
      db.select({
        id: workers.id, userId: workers.userId, name: workers.name, isActive: workers.isActive, loginGone: workers.loginGone,
      }).from(workers).where(and(eq(workers.companyId, tenant.companyId), eq(workers.farmId, farmId))),
    ]);
    const { link, create, retire, restore } = planWorkerSync(accounts, roster);
    const nextVersion = sql`${workers.version} + 1`;
    const inCompany = (id: number) => and(eq(workers.companyId, tenant.companyId), eq(workers.id, id));

    for (const { id, userId } of link) {
      // Switched on as well: this person was just added, which outweighs an old hidden name.
      await db.update(workers)
        .set({ userId, isActive: true, version: nextVersion })
        .where(and(inCompany(id), isNull(workers.userId)));
    }
    if (create.length > 0) {
      await db.insert(workers).values(create.map(worker => ({
        ...worker,
        publicId: generatePublicId(),
        companyId: tenant.companyId,
        farmId,
      }))).onConflictDoNothing();
    }
    for (const { id } of retire) {
      await db.update(workers).set({ isActive: false, loginGone: true, version: nextVersion }).where(inCompany(id));
    }
    for (const { id } of restore) {
      await db.update(workers).set({ isActive: true, loginGone: false, version: nextVersion }).where(inCompany(id));
    }
  }
}
