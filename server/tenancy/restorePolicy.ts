import { TRPCError } from "@trpc/server";

export type TenantImportMode = "append" | "replace";

/** Full replacement is reserved for the guarded platform restore lifecycle. */
export function assertTenantImportMode(mode: TenantImportMode) {
  if (mode === "replace") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Full replacement requires the platform restore lifecycle",
    });
  }
}
