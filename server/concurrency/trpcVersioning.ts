import { TRPCError } from "@trpc/server";
import { VersionConflictError } from "./versioning";

export function rethrowVersionedWriteError(error: unknown, resource: string): never {
  if (error instanceof VersionConflictError) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `${resource} changed since it was loaded. Refresh and try again.`,
      cause: error,
    });
  }
  throw error;
}
