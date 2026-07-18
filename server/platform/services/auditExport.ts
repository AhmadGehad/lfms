import { appendPlatformAudit, listAuditExportRows, type PlatformAuditActor } from "../repositories/audit";
import { requirePlatformDb } from "../repositories/db";
import { csvDocument } from "../csv";

export async function exportAuditCsv(
  input: {
    search?: string;
    outcome?: "success" | "denied" | "error";
    companyPublicId?: string;
  },
  actor: PlatformAuditActor,
) {
  const db = await requirePlatformDb();
  const rows = await listAuditExportRows({ ...input, limit: 10_000 });
  const header = [
    "Timestamp", "Actor", "Actor type", "Company", "Company public ID",
    "Action", "Category", "Entity type", "Entity ID", "Outcome",
    "IP address", "Request ID",
  ];
  const csvRows = rows.map(row => [
    row.createdAt,
    row.actorName,
    row.actorType,
    row.companyName,
    row.companyPublicId,
    row.action,
    row.actionCategory,
    row.entityType,
    row.entityId,
    row.outcome,
    row.ipAddress,
    row.requestId,
  ]);

  await appendPlatformAudit(db, actor, {
    action: "audit.export",
    actionCategory: "data_export",
    entityType: "audit_log",
    outcome: "success",
    metadata: {
      exportedRows: rows.length,
      truncated: rows.length === 10_000,
      filters: input,
    },
  });

  return {
    filename: `lfms-audit-${new Date().toISOString().slice(0, 10)}.csv`,
    content: csvDocument(header, csvRows),
    rowCount: rows.length,
    truncated: rows.length === 10_000,
  };
}
