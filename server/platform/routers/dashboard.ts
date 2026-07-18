import { getPlatformDashboard } from "../services/dashboard";
import { platformPermissionProcedure, platformRouterFactory } from "../trpc";

export const platformDashboardRouter = platformRouterFactory({
  summary: platformPermissionProcedure("platform.dashboard.read").query(getPlatformDashboard),
});
