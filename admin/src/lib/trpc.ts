import { createTRPCReact } from "@trpc/react-query";
import type { PlatformRouter } from "../../../server/platform/router";

export const platformTrpc = createTRPCReact<PlatformRouter>();
