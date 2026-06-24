-- Migration: audit-log revert tracking (undo any action from the audit log)

ALTER TABLE `audit_log` ADD COLUMN `revertedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `audit_log` ADD COLUMN `revertedByUserId` int NULL;
--> statement-breakpoint
ALTER TABLE `audit_log` ADD COLUMN `revertOfAuditId` int NULL;
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entityType`, `entityId`);
