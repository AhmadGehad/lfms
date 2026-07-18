-- System-generated tenant exports have explicit job/export attribution. Tenant
-- uploads keep membership attribution. Exactly one actor source is required.

ALTER TABLE `background_jobs`
  ADD UNIQUE KEY `background_jobs_company_id_id_unique` (`companyId`,`id`);
--> statement-breakpoint
ALTER TABLE `tenant_files`
  MODIFY COLUMN `uploadedByMembershipId` int NULL,
  ADD COLUMN `generatedByBackgroundJobId` bigint NULL,
  ADD COLUMN `generatedByExportJobId` bigint NULL,
  ADD UNIQUE KEY `tenant_files_generated_job_unique` (`generatedByBackgroundJobId`),
  ADD UNIQUE KEY `tenant_files_generated_export_unique` (`generatedByExportJobId`),
  ADD CONSTRAINT `tenant_files_generated_job_fk` FOREIGN KEY (`companyId`,`generatedByBackgroundJobId`) REFERENCES `background_jobs` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `tenant_files_generated_export_fk` FOREIGN KEY (`companyId`,`generatedByExportJobId`) REFERENCES `export_jobs` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `tenant_files_attribution_check` CHECK (
    ((`uploadedByMembershipId` IS NOT NULL) + (`generatedByBackgroundJobId` IS NOT NULL)) = 1
    AND (`generatedByExportJobId` IS NULL OR `generatedByBackgroundJobId` IS NOT NULL)
  );
