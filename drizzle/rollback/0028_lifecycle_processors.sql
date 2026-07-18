ALTER TABLE `tenant_files`
  DROP FOREIGN KEY `tenant_files_generated_export_fk`,
  DROP FOREIGN KEY `tenant_files_generated_job_fk`,
  DROP CONSTRAINT `tenant_files_attribution_check`,
  DROP INDEX `tenant_files_generated_export_unique`,
  DROP INDEX `tenant_files_generated_job_unique`,
  DROP COLUMN `generatedByExportJobId`,
  DROP COLUMN `generatedByBackgroundJobId`,
  MODIFY COLUMN `uploadedByMembershipId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `background_jobs`
  DROP INDEX `background_jobs_company_id_id_unique`;
