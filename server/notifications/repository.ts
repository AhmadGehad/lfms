import { notifications } from "../../drizzle/schema";
import type { DbOrTx } from "../db";
import { isDuplicateEntryError } from "../_core/databaseErrors";
import { generatePublicId } from "../tenancy/publicIds";
import type { NotificationCandidate } from "./decisions";

type NotificationScope = Readonly<{
  companyId: number;
  farmId: number | null;
}>;

export async function insertNotificationOnce(
  db: DbOrTx,
  scope: NotificationScope,
  candidate: NotificationCandidate,
  deduplicationBucket: string,
) {
  const deduplicationKey = [
    scope.farmId ?? "company",
    candidate.relatedEntityType,
    candidate.relatedEntityId,
    deduplicationBucket,
  ].join(":");
  try {
    const [result] = await db.insert(notifications).values({
      publicId: generatePublicId(),
      companyId: scope.companyId,
      farmId: scope.farmId,
      alertType: candidate.alertType,
      title: candidate.title,
      message: candidate.message,
      relatedEntityType: candidate.relatedEntityType,
      relatedEntityId: candidate.relatedEntityId,
      priority: candidate.priority,
      deduplicationKey,
    });
    return Number((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
  } catch (error) {
    if (isDuplicateEntryError(error)) return false;
    throw error;
  }
}
