import type { TrpcContext } from "./context";

/**
 * Best-effort client IP for audit logging. Express resolves trusted forwarding
 * headers according to the configured `trust proxy` policy. Reading forwarding
 * headers directly would let an untrusted client spoof the audit IP.
 * Truncated to the 45-char column width (handles IPv6).
 */
export function getClientIp(ctx: Pick<TrpcContext, "req">): string | undefined {
  const req: any = ctx.req;
  if (!req) return undefined;
  const ip = req.ip ?? req.socket?.remoteAddress ?? undefined;
  if (!ip) return undefined;
  return ip.slice(0, 45);
}
