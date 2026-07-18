import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { listSecurityEventRecords } from "../repositories/security";
import { platformPermissionProcedure, platformRouterFactory } from "../trpc";

const publicId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const platformSecurityRouter = platformRouterFactory({
  list: platformPermissionProcedure("security.read").input(cursorPageInputSchema.extend({
    severity: z.enum(["info", "warning", "high", "critical"]).optional(),
    outcome: z.enum(["success", "denied", "error"]).optional(),
    companyPublicId: publicId.optional(),
  })).query(({ input }) => listSecurityEventRecords(input)),
});
