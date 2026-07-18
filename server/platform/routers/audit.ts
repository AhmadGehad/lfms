import { z } from "zod";
import { cursorPageInputSchema } from "../../../shared/platformApi";
import { listAuditRecords } from "../repositories/audit";
import { exportAuditCsv } from "../services/auditExport";
import { platformAuditActor, platformMfaProcedure, platformPermissionProcedure, platformRouterFactory } from "../trpc";

const auditFilters = z.object({
  search: z.string().trim().max(200).optional(),
  outcome: z.enum(["success", "denied", "error"]).optional(),
  companyPublicId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).optional(),
});

export const platformAuditRouter = platformRouterFactory({
  list: platformPermissionProcedure("audit.read").input(cursorPageInputSchema.extend({
    outcome: z.enum(["success", "denied", "error"]).optional(),
    companyPublicId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).optional(),
  })).query(({ input }) => listAuditRecords(input)),
  exportCsv: platformMfaProcedure("audit.export")
    .input(auditFilters)
    .mutation(({ input, ctx }) => exportAuditCsv(input, platformAuditActor(ctx))),
});
