import type { TrpcContext } from "./context";

/**
 * Best-effort client IP for audit logging. Honors common proxy headers
 * (x-forwarded-for, x-real-ip) and falls back to the socket address.
 * Truncated to the 45-char column width (handles IPv6).
 */
export function getClientIp(ctx: Pick<TrpcContext, "req">): string | undefined {
  const req: any = ctx.req;
  if (!req) return undefined;
  const fwd = req.headers?.["x-forwarded-for"];
  let ip: string | undefined;
  if (typeof fwd === "string" && fwd.length) {
    ip = fwd.split(",")[0].trim();
  } else if (Array.isArray(fwd) && fwd.length) {
    ip = String(fwd[0]).trim();
  } else if (typeof req.headers?.["x-real-ip"] === "string") {
    ip = req.headers["x-real-ip"];
  } else {
    ip = req.ip ?? req.socket?.remoteAddress ?? undefined;
  }
  if (!ip) return undefined;
  return ip.slice(0, 45);
}
