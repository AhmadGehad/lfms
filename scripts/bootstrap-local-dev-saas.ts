import "dotenv/config";
import { and, eq } from "drizzle-orm";
import {
  companies,
  companyMemberships,
  companySubscriptions,
  featureCatalog,
  farms,
  planEntitlements,
  platformAdministratorRoles,
  platformAdministrators,
  platformPermissions,
  platformRolePermissions,
  platformRoles,
  subscriptionPlans,
  users,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { ENV } from "../server/_core/env";
import { generatePublicId } from "../server/tenancy/publicIds";
import { PLATFORM_PERMISSIONS } from "../shared/tenancy";
import { PAGE_FEATURES } from "../server/entitlements/sqlStore";

if (!ENV.isDevelopment || !ENV.enableLocalDevAuth) {
  throw new Error("Local SaaS bootstrap is available only with development local auth enabled");
}

const openId = ENV.ownerOpenId || "local-dev-owner";
const email = "local@lfms.dev";
const db = await getDb();
if (!db) throw new Error("DATABASE_URL is required");

const result = await db.transaction(async tx => {
  let [user] = await tx.select().from(users).where(eq(users.openId, openId)).limit(1).for("update");
  if (!user) {
    await tx.insert(users).values({
      publicId: generatePublicId(),
      openId,
      name: "Local Developer",
      email,
      normalizedEmail: email,
      loginMethod: "local-dev",
      role: "owner",
      status: "active",
      lastSignedIn: new Date(),
    });
    [user] = await tx.select().from(users).where(eq(users.openId, openId)).limit(1).for("update");
  }
  if (!user) throw new Error("Unable to bootstrap local SaaS user");

  let [company] = await tx.select().from(companies).where(eq(companies.slug, "azal-farms")).limit(1).for("update");
  if (!company) {
    await tx.insert(companies).values({
      publicId: generatePublicId(),
      name: "Azal Farms",
      slug: "azal-farms",
      lifecycleStatus: "active",
    });
    [company] = await tx.select().from(companies).where(eq(companies.slug, "azal-farms")).limit(1).for("update");
  }
  if (!company) throw new Error("Unable to bootstrap local SaaS company");

  let [membership] = await tx.select().from(companyMemberships).where(and(
    eq(companyMemberships.companyId, company.id),
    eq(companyMemberships.userId, user.id),
  )).limit(1).for("update");
  if (!membership) {
    await tx.insert(companyMemberships).values({
      publicId: generatePublicId(),
      companyId: company.id,
      userId: user.id,
      role: "owner",
      status: "active",
      farmAccessMode: "all",
      joinedAt: new Date(),
    });
    [membership] = await tx.select().from(companyMemberships).where(and(
      eq(companyMemberships.companyId, company.id),
      eq(companyMemberships.userId, user.id),
    )).limit(1).for("update");
  }
  if (!membership) throw new Error("Unable to bootstrap local SaaS membership");

  let [farm] = await tx.select().from(farms).where(and(
    eq(farms.companyId, company.id),
    eq(farms.code, "AZAL"),
  )).limit(1).for("update");
  if (!farm) {
    await tx.insert(farms).values({
      publicId: generatePublicId(),
      companyId: company.id,
      name: "Azal Main Farm",
      code: "AZAL",
      status: "active",
      timezone: "Africa/Cairo",
      createdByMembershipId: membership.id,
    });
    [farm] = await tx.select().from(farms).where(and(
      eq(farms.companyId, company.id),
      eq(farms.code, "AZAL"),
    )).limit(1).for("update");
  }
  if (!farm) throw new Error("Unable to bootstrap local SaaS farm");

  for (const code of PLATFORM_PERMISSIONS) {
    const [permission] = await tx.select().from(platformPermissions).where(eq(platformPermissions.code, code)).limit(1);
    if (!permission) await tx.insert(platformPermissions).values({ code });
  }
  let [role] = await tx.select().from(platformRoles).where(eq(platformRoles.code, "platform_admin")).limit(1).for("update");
  if (!role) {
    await tx.insert(platformRoles).values({
      code: "platform_admin",
      name: "Local platform administrator",
      description: "Development-only administrator role",
      isSystem: true,
    });
    [role] = await tx.select().from(platformRoles).where(eq(platformRoles.code, "platform_admin")).limit(1).for("update");
  }
  if (!role) throw new Error("Unable to bootstrap platform role");

  for (const code of PLATFORM_PERMISSIONS) {
    const [permission] = await tx.select().from(platformPermissions).where(eq(platformPermissions.code, code)).limit(1);
    if (!permission) throw new Error(`Missing platform permission: ${code}`);
    const [grant] = await tx.select().from(platformRolePermissions).where(and(
      eq(platformRolePermissions.platformRoleId, role.id),
      eq(platformRolePermissions.platformPermissionId, permission.id),
    )).limit(1);
    if (!grant) await tx.insert(platformRolePermissions).values({
      platformRoleId: role.id,
      platformPermissionId: permission.id,
    });
  }

  let [administrator] = await tx.select().from(platformAdministrators)
    .where(eq(platformAdministrators.userId, user.id)).limit(1).for("update");
  if (!administrator) {
    await tx.insert(platformAdministrators).values({
      publicId: generatePublicId(),
      userId: user.id,
      status: "active",
      mfaRequired: true,
    });
    [administrator] = await tx.select().from(platformAdministrators)
      .where(eq(platformAdministrators.userId, user.id)).limit(1).for("update");
  }
  if (!administrator) throw new Error("Unable to bootstrap local platform administrator");
  const [administratorRole] = await tx.select().from(platformAdministratorRoles).where(and(
    eq(platformAdministratorRoles.platformAdministratorId, administrator.id),
    eq(platformAdministratorRoles.platformRoleId, role.id),
  )).limit(1);
  if (!administratorRole) await tx.insert(platformAdministratorRoles).values({
    platformAdministratorId: administrator.id,
    platformRoleId: role.id,
  });

  // Quota checks (getEffectiveLimit) fail closed to 0 when a *_limit feature
  // is missing from the catalog, so the limit features must be seeded too.
  const limitUnits = new Map<string, "count" | "bytes">([
    ["users_limit", "count"],
    ["farms_limit", "count"],
    ["animals_limit", "count"],
    ["storage_limit", "bytes"],
  ]);
  const featureCodes = [...new Set([...Object.values(PAGE_FEATURES), ...limitUnits.keys()])];
  const featureIds = new Map<string, number>();
  for (const code of featureCodes) {
    let [feature] = await tx.select().from(featureCatalog).where(eq(featureCatalog.code, code)).limit(1).for("update");
    if (!feature) {
      await tx.insert(featureCatalog).values({
        publicId: generatePublicId(),
        code,
        name: code.replaceAll("_", " "),
        status: "active",
        disabledDataMode: "read_only",
        limitUnit: limitUnits.get(code) ?? "boolean",
      });
      [feature] = await tx.select().from(featureCatalog).where(eq(featureCatalog.code, code)).limit(1).for("update");
    }
    if (!feature) throw new Error(`Unable to bootstrap feature: ${code}`);
    featureIds.set(code, feature.id);
  }
  let [plan] = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, "local-development")).limit(1).for("update");
  if (!plan) {
    await tx.insert(subscriptionPlans).values({
      publicId: generatePublicId(),
      code: "local-development",
      name: "Local development",
      description: "Development-only full feature entitlement",
      status: "active",
      planVersion: 1,
      currency: "USD",
      createdByPlatformAdministratorId: administrator.id,
      publishedAt: new Date(),
    });
    [plan] = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, "local-development")).limit(1).for("update");
  }
  if (!plan) throw new Error("Unable to bootstrap local development plan");
  for (const featureId of featureIds.values()) {
    const [entitlement] = await tx.select().from(planEntitlements).where(and(
      eq(planEntitlements.subscriptionPlanId, plan.id),
      eq(planEntitlements.featureId, featureId),
    )).limit(1);
    if (!entitlement) await tx.insert(planEntitlements).values({
      subscriptionPlanId: plan.id,
      featureId,
      accessMode: "enabled",
      limitValue: null,
    });
  }
  const [subscription] = await tx.select().from(companySubscriptions).where(and(
    eq(companySubscriptions.companyId, company.id),
    eq(companySubscriptions.isCurrent, true),
  )).limit(1).for("update");
  if (!subscription) await tx.insert(companySubscriptions).values({
    publicId: generatePublicId(),
    companyId: company.id,
    subscriptionPlanId: plan.id,
    planSnapshot: { code: plan.code, version: plan.planVersion, localDevelopment: true },
    status: "active",
    periodStart: new Date(Date.now() - 60_000),
    periodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000),
    isCurrent: true,
    changedByPlatformAdministratorId: administrator.id,
  });

  return { company: company.slug, farm: farm.code, userId: user.id, administratorId: administrator.id };
});

process.stdout.write(`${JSON.stringify(result)}\n`);
