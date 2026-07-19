import { timingSafeEqual } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { ENV } from "../_core/env";
import { getRequestId, getResolvedRequestHost } from "../_core/security/httpSecurity";
import { getPlatformHealth, ensureHealthChecks } from "../platform/services/health";
import { healthRegistry, publicReadiness } from "./health";
import { logger, withLogContext } from "./logger";

type MetricKey = `${string}|${string}|${number}`;
const requests = new Map<MetricKey, number>();
const durations = new Map<MetricKey, { count: number; sumSeconds: number }>();

function routeGroup(pathname: string) {
  if (pathname.startsWith("/api/platform")) return "platform_api";
  if (pathname.startsWith("/api/trpc")) return "tenant_api";
  if (pathname.startsWith("/api/oauth")) return "tenant_auth";
  if (pathname.startsWith("/api/platform/auth")) return "platform_auth";
  if (pathname.startsWith("/manus-storage")) return "storage";
  if (pathname.startsWith("/health")) return "health";
  return "static";
}

export function requestObservabilityMiddleware(): RequestHandler {
  return (req, res, next) => {
    const started = performance.now();
    const requestId = getRequestId(res);
    const surface = getResolvedRequestHost(res)?.surface ?? "unknown";
    withLogContext({ requestId }, () => {
      res.on("finish", () => {
        const group = `${surface}:${routeGroup(req.path)}`;
        const key = `${req.method}|${group}|${res.statusCode}` as MetricKey;
        requests.set(key, (requests.get(key) ?? 0) + 1);
        const duration = (performance.now() - started) / 1_000;
        const current = durations.get(key) ?? { count: 0, sumSeconds: 0 };
        durations.set(key, { count: current.count + 1, sumSeconds: current.sumSeconds + duration });
        logger.info("http.request", {
          method: req.method,
          routeGroup: group,
          status: res.statusCode,
          durationMs: Math.round(duration * 1_000),
        });
      });
      next();
    });
  };
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function renderMetrics() {
  const lines = [
    "# HELP lfms_http_requests_total HTTP requests completed.",
    "# TYPE lfms_http_requests_total counter",
  ];
  for (const [key, value] of requests) {
    const [method, route, status] = key.split("|");
    lines.push(`lfms_http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`);
  }
  lines.push(
    "# HELP lfms_http_request_duration_seconds_sum Total HTTP request duration.",
    "# TYPE lfms_http_request_duration_seconds_sum counter",
  );
  for (const [key, value] of durations) {
    const [method, route, status] = key.split("|");
    const labels = `method="${method}",route="${route}",status="${status}"`;
    lines.push(`lfms_http_request_duration_seconds_sum{${labels}} ${value.sumSeconds.toFixed(6)}`);
    lines.push(`lfms_http_request_duration_seconds_count{${labels}} ${value.count}`);
  }
  return `${lines.join("\n")}\n`;
}

export function registerObservabilityRoutes(app: Express) {
  ensureHealthChecks();
  app.get("/health/live", (_req, res) => res.json(healthRegistry.liveness()));
  app.get("/health/ready", async (_req, res) => {
    const snapshot = await getPlatformHealth();
    res
      .status(snapshot.status === "unavailable" ? 503 : 200)
      .json(publicReadiness(snapshot));
  });
  app.get("/metrics", (req, res) => {
    const expected = ENV.metricsBearerToken;
    const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if ((ENV.isProduction && expected.length < 32) || !expected || !safeEqual(supplied, expected)) {
      res.status(404).send("Not found");
      return;
    }
    res.type("text/plain; version=0.0.4").send(renderMetrics());
  });
}
