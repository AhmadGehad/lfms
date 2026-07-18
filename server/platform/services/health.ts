import { healthRegistry } from "../../observability/health";
import { countJobTotals, checkDatabase } from "../repositories/operations";

let registered = false;

export function ensureHealthChecks() {
  if (registered) return;
  registered = true;
  healthRegistry.register("database", async () => {
    await checkDatabase();
    return { status: "ok" as const };
  }, { critical: true, timeoutMs: 2_000 });
  healthRegistry.register("job_queue", async () => {
    const jobs = await countJobTotals();
    return jobs.failed > 0
      ? { status: "degraded" as const, message: `${jobs.failed} jobs need attention` }
      : { status: "ok" as const };
  }, { critical: true, timeoutMs: 2_000 });
}

export async function getPlatformHealth() {
  ensureHealthChecks();
  return healthRegistry.readiness();
}
