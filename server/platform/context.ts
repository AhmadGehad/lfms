import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { PlatformContext } from "../../shared/tenancy";

export type PlatformTrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  platform: PlatformContext | null;
  csrfToken: string | null;
  requireCsrf: () => void | Promise<void>;
  revokeSession: () => Promise<void>;
};

export type PlatformContextResolver = (
  opts: CreateExpressContextOptions,
) => Promise<Omit<PlatformTrpcContext, "req" | "res">>;

let resolver: PlatformContextResolver | null = null;

export function configurePlatformContextResolver(next: PlatformContextResolver) {
  if (resolver) throw new Error("Platform context resolver is already configured");
  resolver = next;
}

export async function createPlatformContext(
  opts: CreateExpressContextOptions,
): Promise<PlatformTrpcContext> {
  if (!resolver) {
    return {
      ...opts,
      platform: null,
      csrfToken: null,
      requireCsrf: () => {
        throw new Error("Platform authentication is not configured");
      },
      revokeSession: async () => {
        throw new Error("Platform authentication is not configured");
      },
    };
  }

  return { ...opts, ...(await resolver(opts)) };
}
