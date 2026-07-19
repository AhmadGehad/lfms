export type HealthStatus = "ok" | "degraded" | "unavailable";

export type HealthCheckResult = {
  status: HealthStatus;
  message?: string;
  latencyMs: number;
};

export type HealthSnapshot = {
  status: HealthStatus;
  checkedAt: string;
  uptimeSeconds: number;
  checks: Record<string, HealthCheckResult>;
};

export function publicReadiness(snapshot: HealthSnapshot) {
  return {
    status: snapshot.status,
    checkedAt: snapshot.checkedAt,
  };
}

type RegisteredCheck = {
  critical: boolean;
  timeoutMs: number;
  run: () => Promise<Omit<HealthCheckResult, "latencyMs"> | void>;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    timeout.unref?.();
    promise.then(
      value => { clearTimeout(timeout); resolve(value); },
      error => { clearTimeout(timeout); reject(error); },
    );
  });
}

export class HealthRegistry {
  private readonly checks = new Map<string, RegisteredCheck>();

  register(
    name: string,
    run: RegisteredCheck["run"],
    options: { critical?: boolean; timeoutMs?: number } = {},
  ) {
    if (this.checks.has(name)) throw new Error(`Health check already registered: ${name}`);
    this.checks.set(name, {
      run,
      critical: options.critical ?? true,
      timeoutMs: options.timeoutMs ?? 2_000,
    });
  }

  liveness() {
    return {
      status: "ok" as const,
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async readiness(): Promise<HealthSnapshot> {
    const results = await Promise.all(Array.from(this.checks, async ([name, check]) => {
      const started = performance.now();
      try {
        const result = await withTimeout(Promise.resolve(check.run()), check.timeoutMs);
        return [name, {
          status: result?.status ?? "ok",
          message: result?.message,
          latencyMs: Math.round(performance.now() - started),
        }, check.critical] as const;
      } catch (error) {
        return [name, {
          status: "unavailable" as const,
          message: error instanceof Error ? error.message : "Unknown health check failure",
          latencyMs: Math.round(performance.now() - started),
        }, check.critical] as const;
      }
    }));

    const checks: HealthSnapshot["checks"] = {};
    let status: HealthStatus = "ok";
    for (const [name, result, critical] of results) {
      checks[name] = result;
      if (result.status === "unavailable") status = critical ? "unavailable" : status === "ok" ? "degraded" : status;
      else if (result.status === "degraded" && status === "ok") status = "degraded";
    }

    return {
      status,
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks,
    };
  }
}

export const healthRegistry = new HealthRegistry();
