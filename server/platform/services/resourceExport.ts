import { csvDocument } from "../csv";
import { appendPlatformAudit, type PlatformAuditActor } from "../repositories/audit";
import { listCompanyExportRows } from "../repositories/companies";
import { requirePlatformDb } from "../repositories/db";
import { listFarmExportRows } from "../repositories/farms";

const EXPORT_LIMIT = 10_000;

export async function exportCompaniesCsv(input: {
  search?: string;
  status?: "provisioning" | "active" | "suspended" | "deletion_requested" | "purging" | "deleted";
}, actor: PlatformAuditActor) {
  const rows = await listCompanyExportRows({ ...input, limit: EXPORT_LIMIT });
  await appendPlatformAudit(await requirePlatformDb(), actor, {
    action: "company.export",
    actionCategory: "data_export",
    entityType: "company",
    metadata: { exportedRows: rows.length, truncated: rows.length === EXPORT_LIMIT, filters: input },
  });
  return {
    filename: `lfms-companies-${new Date().toISOString().slice(0, 10)}.csv`,
    content: csvDocument(
      ["Public ID", "Name", "Slug", "Status", "Plan", "Subscription", "Farms", "Users", "Created", "Updated"],
      rows.map(row => [row.publicId, row.name, row.slug, row.status, row.planName, row.subscriptionStatus, row.farmCount, row.memberCount, row.createdAt, row.updatedAt]),
    ),
    rowCount: rows.length,
    truncated: rows.length === EXPORT_LIMIT,
  };
}

export async function exportFarmsCsv(input: {
  search?: string;
  status?: "active" | "suspended" | "archived";
  companyPublicId?: string;
}, actor: PlatformAuditActor) {
  const rows = await listFarmExportRows({ ...input, limit: EXPORT_LIMIT });
  await appendPlatformAudit(await requirePlatformDb(), actor, {
    action: "farm.export",
    actionCategory: "data_export",
    entityType: "farm",
    metadata: { exportedRows: rows.length, truncated: rows.length === EXPORT_LIMIT, filters: input },
  });
  return {
    filename: `lfms-farms-${new Date().toISOString().slice(0, 10)}.csv`,
    content: csvDocument(
      ["Public ID", "Company ID", "Company", "Name", "Code", "Timezone", "Status", "Assigned users", "Created", "Updated"],
      rows.map(row => [row.publicId, row.companyPublicId, row.companyName, row.name, row.code, row.timezone, row.status, row.memberCount, row.createdAt, row.updatedAt]),
    ),
    rowCount: rows.length,
    truncated: rows.length === EXPORT_LIMIT,
  };
}
