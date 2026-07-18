import { TRPCError } from "@trpc/server";
import { logger } from "../../observability/logger";

export function rethrowPlatformWriteError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const code = error && typeof error === "object"
    ? String((error as { code?: unknown; cause?: { code?: unknown } }).code
      ?? (error as { cause?: { code?: unknown } }).cause?.code
      ?? "")
    : "";
  if (code === "ER_DUP_ENTRY") {
    throw new TRPCError({ code: "CONFLICT", message: "A record with these unique values already exists" });
  }
  logger.error("platform.write_failed", { databaseCode: code || null, error });
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "The request could not be completed. No changes were saved.",
  });
}
