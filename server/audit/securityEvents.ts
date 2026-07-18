import type { Request } from "express";
import { securityEvents } from "../../drizzle/schema";
import { getDb } from "../db";
import { logger } from "../observability/logger";
import { generatePublicId } from "../tenancy/publicIds";

export async function recordTenantContextDenial(input: {
  req: Request;
  requestId: string;
  userId: number;
  companySlug: string | null;
  code: string;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(securityEvents).values({
      publicId: generatePublicId(),
      actorType: "tenant_user",
      userId: input.userId,
      eventType: "tenant.context_denied",
      severity: input.code === "FARM_ACCESS_DENIED" ? "high" : "warning",
      outcome: "denied",
      requestId: input.requestId.slice(0, 64),
      ipAddress: (input.req.ip || input.req.socket.remoteAddress || "").slice(0, 45) || null,
      userAgent: input.req.get("user-agent")?.slice(0, 500) ?? null,
      metadata: {
        code: input.code.slice(0, 80),
        requestedCompanySlug: input.companySlug?.slice(0, 100) ?? null,
      },
    });
  } catch (error) {
    logger.error("security.tenant_context_denial_record_failed", {
      requestId: input.requestId,
      error,
    });
  }
}
