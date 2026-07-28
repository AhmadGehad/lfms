import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

/** Response types inferred from the router, so pages never need `any`. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
