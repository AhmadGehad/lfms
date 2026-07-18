import { TRPCError } from "@trpc/server";

export function notFound(resource: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${resource} not found` });
}

export function versionConflict(resource: string): never {
  throw new TRPCError({
    code: "CONFLICT",
    message: `${resource} changed since it was loaded. Refresh and try again.`,
  });
}

export function invalidLifecycle(message: string): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message });
}
