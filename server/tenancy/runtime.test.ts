import { describe, expect, it } from "vitest";
import { runWithTenantContext, requireTenantActorContext } from "./runtime";

describe("tenant execution context", () => {
  it("fails closed outside an explicitly scoped operation", () => {
    expect(() => requireTenantActorContext()).toThrow("TENANT_CONTEXT_REQUIRED");
  });

  it("keeps concurrent tenant operations isolated", async () => {
    const readCompany = (companyId: number, delay: number) =>
      runWithTenantContext(
        { actorType: "system_job", jobId: companyId, companyId, requestId: `r-${companyId}` },
        async () => {
          await new Promise(resolve => setTimeout(resolve, delay));
          return requireTenantActorContext().companyId;
        },
      );

    await expect(Promise.all([readCompany(1, 5), readCompany(2, 0)]))
      .resolves.toEqual([1, 2]);
  });
});
