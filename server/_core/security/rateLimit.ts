import { createHmac } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { getRequestId } from "./httpSecurity";
import { logger } from "../../observability/logger";

export interface RateLimitStore {
  /** Atomically increments and returns the count for this key and bucket. */
  increment(
    keyHash: string,
    bucketStart: Date,
    expiresAt: Date,
  ): Promise<number>;
}

export type RateLimitOptions = {
  namespace: string;
  secret: string;
  store: RateLimitStore;
  maximumRequests: number;
  windowMs: number;
  key: (req: Request) => string | null;
  now?: () => Date;
};

export function getClientAddress(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function createRateLimitMiddleware(
  options: RateLimitOptions,
): RequestHandler {
  if (options.secret.length < 32) {
    throw new Error("Rate-limit secret must contain at least 32 characters");
  }
  if (options.maximumRequests < 1 || options.windowMs < 1_000) {
    throw new Error("Invalid rate-limit configuration");
  }
  const now = options.now ?? (() => new Date());

  return async (req, res, next) => {
    const rawKey = options.key(req);
    if (!rawKey) {
      next();
      return;
    }

    const current = now();
    const bucketTime = Math.floor(current.getTime() / options.windowMs) * options.windowMs;
    const bucketStart = new Date(bucketTime);
    const expiresAt = new Date(bucketTime + options.windowMs * 2);
    const resetSeconds = Math.max(
      1,
      Math.ceil((bucketTime + options.windowMs - current.getTime()) / 1_000),
    );
    const keyHash = createHmac("sha256", options.secret)
      .update(options.namespace)
      .update("\0")
      .update(rawKey)
      .digest("hex");

    try {
      const count = await options.store.increment(
        keyHash,
        bucketStart,
        expiresAt,
      );
      res.setHeader("RateLimit-Limit", String(options.maximumRequests));
      res.setHeader(
        "RateLimit-Remaining",
        String(Math.max(0, options.maximumRequests - count)),
      );
      res.setHeader("RateLimit-Reset", String(resetSeconds));

      if (count > options.maximumRequests) {
        res.setHeader("Retry-After", String(resetSeconds));
        res.status(429).json({
          error: "Too many requests",
          requestId: getRequestId(res),
        });
        return;
      }
      next();
    } catch (error) {
      logger.error("security.rate_limit_store_unavailable", {
        requestId: getRequestId(res),
        namespace: options.namespace,
        error,
      });
      res.status(503).json({
        error: "Authentication protection unavailable",
        requestId: getRequestId(res),
      });
    }
  };
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<
    string,
    { count: number; expiresAt: Date }
  >();

  async increment(keyHash: string, bucketStart: Date, expiresAt: Date) {
    const now = Date.now();
    this.buckets.forEach((value, key) => {
      if (value.expiresAt.getTime() <= now) this.buckets.delete(key);
    });

    const key = `${keyHash}:${bucketStart.toISOString()}`;
    const existing = this.buckets.get(key);
    const count = (existing?.count ?? 0) + 1;
    this.buckets.set(key, { count, expiresAt });
    return count;
  }
}
