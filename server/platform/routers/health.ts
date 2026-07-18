import { getPlatformHealth } from "../services/health";
import { platformPermissionProcedure, platformRouterFactory } from "../trpc";

export const platformHealthRouter = platformRouterFactory({
  summary: platformPermissionProcedure("operations.read").query(getPlatformHealth),
});
