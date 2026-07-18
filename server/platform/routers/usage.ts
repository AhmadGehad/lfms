import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { listUsageRecords } from "../repositories/usage";
import { platformPermissionProcedure, platformRouterFactory } from "../trpc";

export const platformUsageRouter = platformRouterFactory({
  list: platformPermissionProcedure("usage.read").input(cursorPageInputSchema.extend({
    companyPublicId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).optional(),
    periodType: z.enum(["lifetime", "daily", "monthly", "billing_period"]).optional(),
  })).query(({ input }) => listUsageRecords(input)),
});
