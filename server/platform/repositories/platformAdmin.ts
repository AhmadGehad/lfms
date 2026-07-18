import { eq } from "drizzle-orm";
import { platformAdministrators, users } from "../../../drizzle/schema";
import { requirePlatformDb } from "./db";

export async function getPlatformAdminProfile(platformAdminId: number) {
  const db = await requirePlatformDb();
  const [profile] = await db.select({
    publicId: platformAdministrators.publicId,
    name: users.name,
    email: users.email,
    status: platformAdministrators.status,
    mfaRequired: platformAdministrators.mfaRequired,
  }).from(platformAdministrators)
    .innerJoin(users, eq(platformAdministrators.userId, users.id))
    .where(eq(platformAdministrators.id, platformAdminId))
    .limit(1);
  return profile ?? null;
}
