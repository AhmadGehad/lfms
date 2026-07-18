import { platformRouterFactory } from "./trpc";
import { platformAuditRouter } from "./routers/audit";
import { platformAdministratorsRouter } from "./routers/administrators";
import { platformAuthRouter } from "./routers/auth";
import { platformCompaniesRouter } from "./routers/companies";
import { platformDashboardRouter } from "./routers/dashboard";
import { platformFarmsRouter } from "./routers/farms";
import { platformFeaturesRouter } from "./routers/features";
import { platformHealthRouter } from "./routers/health";
import { platformLifecycleRouter } from "./routers/lifecycle";
import { platformMembershipsRouter } from "./routers/memberships";
import { platformPlansRouter } from "./routers/plans";
import { platformSupportRouter } from "./routers/support";
import { platformSubscriptionsRouter } from "./routers/subscriptions";
import { platformSecurityRouter } from "./routers/security";
import { platformUsageRouter } from "./routers/usage";

export const platformRouter = platformRouterFactory({
  auth: platformAuthRouter,
  administrators: platformAdministratorsRouter,
  dashboard: platformDashboardRouter,
  companies: platformCompaniesRouter,
  farms: platformFarmsRouter,
  memberships: platformMembershipsRouter,
  plans: platformPlansRouter,
  features: platformFeaturesRouter,
  usage: platformUsageRouter,
  audit: platformAuditRouter,
  support: platformSupportRouter,
  subscriptions: platformSubscriptionsRouter,
  health: platformHealthRouter,
  security: platformSecurityRouter,
  lifecycle: platformLifecycleRouter,
});

export type PlatformRouter = typeof platformRouter;
