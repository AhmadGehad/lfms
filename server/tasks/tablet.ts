import { TRPCError } from "@trpc/server";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { createHmac, randomInt } from "node:crypto";
import { companies, companyMemberships, farmMemberships, users } from "../../drizzle/schema";
import { tabletAccounts } from "../../drizzle/schema.workerTasks";
import { TABLET_BLOCKED } from "../../shared/tasks";
import type { TenantContext } from "../../shared/tenancy";
import { getOAuthStateSecret } from "../_core/auth/runtime";
import { getDb } from "../db";
import { generatePublicId } from "../tenancy/publicIds";
import { requireFarmId } from "./service";

const CODE_TTL_MS = 15 * 60 * 1_000;
/** No 0/O, 1/I/L: this gets read off one screen and typed on another. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

function hashCode(companyId: number, code: string) {
  return createHmac("sha256", getOAuthStateSecret()).update(`tablet:${companyId}:${code}`).digest("hex");
}

export function normalizeTabletCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return code.length === CODE_LENGTH ? code : null;
}

/**
 * Only a tablet never connected, or disconnected by the farm, comes back. One
 * suspended or removed in Admin stays that way, and its sessions stay dead.
 */
function mayConnect(status: string | undefined, connectedAt: Date | null) {
  return status === "active" || (status === "suspended" && connectedAt === null);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

async function findAccount(tenant: TenantContext, farmId: number) {
  const db = await requireDb();
  const [account] = await db.select().from(tabletAccounts).where(and(
    eq(tabletAccounts.companyId, tenant.companyId),
    eq(tabletAccounts.farmId, farmId),
  )).limit(1);
  return account ?? null;
}

async function membershipOf(companyId: number, userId: number) {
  const db = await requireDb();
  const [membership] = await db.select({ id: companyMemberships.id, status: companyMemberships.status })
    .from(companyMemberships)
    .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.userId, userId)))
    .limit(1);
  return membership ?? null;
}

export async function getTabletStatus(tenant: TenantContext) {
  const account = await findAccount(tenant, requireFarmId(tenant));
  if (!account) return { connected: false, connectedAt: null };
  const membership = await membershipOf(tenant.companyId, account.userId);
  const connected = membership?.status === "active" && account.connectedAt !== null;
  return { connected, connectedAt: connected ? account.connectedAt : null };
}

/**
 * A code for connecting tablets at this farm. The account behind it has no email or
 * password, only the worker role on this one farm, and doesn't take up a user seat.
 */
export async function createTabletCode(tenant: TenantContext) {
  const db = await requireDb();
  const farmId = requireFarmId(tenant);
  const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db.transaction(async tx => {
    const [existing] = await tx.select({
      id: tabletAccounts.id, userId: tabletAccounts.userId, connectedAt: tabletAccounts.connectedAt,
    }).from(tabletAccounts).where(and(
      eq(tabletAccounts.companyId, tenant.companyId),
      eq(tabletAccounts.farmId, farmId),
    )).limit(1);
    const secret = { codeHash: hashCode(tenant.companyId, code), codeExpiresAt: expiresAt };
    if (existing) {
      const [membership] = await tx.select({ status: companyMemberships.status }).from(companyMemberships)
        .where(and(eq(companyMemberships.companyId, tenant.companyId), eq(companyMemberships.userId, existing.userId)))
        .limit(1);
      if (!mayConnect(membership?.status, existing.connectedAt)) {
        // A code here could never work, so say why now, not at the tablet.
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: TABLET_BLOCKED });
      }
      await tx.update(tabletAccounts).set(secret).where(eq(tabletAccounts.id, existing.id));
      return;
    }
    const publicId = generatePublicId();
    const [user] = await tx.insert(users).values({
      publicId, openId: `tablet_${publicId}`, name: "Farm tablet", loginMethod: "tablet_code",
    }).returning({ id: users.id });
    const [membership] = await tx.insert(companyMemberships).values({
      publicId: generatePublicId(),
      companyId: tenant.companyId,
      userId: user.id,
      role: "worker",
      status: "suspended",
      farmAccessMode: "restricted",
    }).returning({ id: companyMemberships.id });
    await tx.insert(farmMemberships).values({ companyId: tenant.companyId, companyMembershipId: membership.id, farmId });
    await tx.insert(tabletAccounts).values({
      ...secret, companyId: tenant.companyId, farmId, userId: user.id, createdBy: tenant.userId,
    });
  });
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt };
}

/** Signs out every tablet at this farm. Connecting one again takes a new code. */
export async function disconnectTablets(tenant: TenantContext) {
  const db = await requireDb();
  const account = await findAccount(tenant, requireFarmId(tenant));
  if (!account) return;
  await db.transaction(async tx => {
    const [membership] = await tx.select({ status: companyMemberships.status }).from(companyMemberships)
      .where(and(eq(companyMemberships.companyId, tenant.companyId), eq(companyMemberships.userId, account.userId)))
      .limit(1);
    // connectedAt stays set on one suspended in Admin, so a disconnect can't make it reconnectable.
    if (membership?.status === "active") {
      await tx.update(tabletAccounts).set({ codeHash: null, codeExpiresAt: null, connectedAt: null })
        .where(eq(tabletAccounts.id, account.id));
      await tx.update(companyMemberships).set({ status: "suspended", authorizationVersion: sql`${companyMemberships.authorizationVersion} + 1` })
        .where(and(eq(companyMemberships.companyId, tenant.companyId), eq(companyMemberships.userId, account.userId)));
    } else {
      await tx.update(tabletAccounts).set({ codeHash: null, codeExpiresAt: null }).where(eq(tabletAccounts.id, account.id));
    }
    // Ends the sessions those tablets hold, so a later code can't bring them back.
    await tx.update(users).set({ authVersion: sql`${users.authVersion} + 1` }).where(eq(users.id, account.userId));
  });
}

/** Spends a code, once, on the company whose address it was typed at. Returns the tablet's user. */
export async function redeemTabletCode(companySlug: string, code: string) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [company] = await tx.select({ id: companies.id }).from(companies).where(and(
      eq(companies.slug, companySlug),
      ne(companies.lifecycleStatus, "deleted"),
    )).limit(1);
    if (!company) return null;
    const [account] = await tx.select().from(tabletAccounts).where(and(
      eq(tabletAccounts.companyId, company.id),
      eq(tabletAccounts.codeHash, hashCode(company.id, code)),
      gt(tabletAccounts.codeExpiresAt, new Date()),
    )).limit(1).for("update");
    if (!account) return null;
    const [membership] = await tx.select({ id: companyMemberships.id, status: companyMemberships.status })
      .from(companyMemberships)
      .where(and(eq(companyMemberships.companyId, company.id), eq(companyMemberships.userId, account.userId)))
      .limit(1).for("update");
    const allowed = mayConnect(membership?.status, account.connectedAt);
    await tx.update(tabletAccounts).set({
      codeHash: null,
      codeExpiresAt: null,
      ...(allowed ? { connectedAt: new Date() } : {}),
    }).where(eq(tabletAccounts.id, account.id));
    if (!allowed) return null;
    if (membership.status !== "active") {
      await tx.update(companyMemberships).set({
        status: "active",
        joinedAt: new Date(),
        authorizationVersion: sql`${companyMemberships.authorizationVersion} + 1`,
      }).where(eq(companyMemberships.id, membership.id));
    }
    const [user] = await tx.select().from(users).where(eq(users.id, account.userId)).limit(1);
    return user ?? null;
  });
}
