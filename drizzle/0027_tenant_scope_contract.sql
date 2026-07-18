-- Contract phase. Apply only after the rehearsal validator reports zero nulls,
-- zero cross-tenant references, and matching row counts/checksums.
-- The tenant-aware application image must be ready before writes resume.

ALTER TABLE `animals` DROP FOREIGN KEY `animals_ownerId_fk`;
--> statement-breakpoint
ALTER TABLE `vaccination_records`
  DROP FOREIGN KEY `vaccination_records_animalId_fk`,
  DROP FOREIGN KEY `vaccination_records_vaccineId_fk`;
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `publicId` varchar(26) NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_settings`
  DROP INDEX `user_settings_user_key_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD UNIQUE KEY `user_settings_company_user_key_unique` (`companyId`,`userId`,`settingKey`),
  ADD CONSTRAINT `user_settings_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `user_settings_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `species`
  DROP INDEX `species_name_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `species_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `animal_categories`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `animal_categories_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animal_categories_species_fk` FOREIGN KEY (`companyId`,`speciesId`) REFERENCES `species` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animal_categories_auto_target_fk` FOREIGN KEY (`companyId`,`autoStageTargetCategoryId`) REFERENCES `animal_categories` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `animal_statuses`
  DROP INDEX `animal_statuses_name_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `animal_statuses_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `groups`
  DROP INDEX `groups_groupCode_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  MODIFY COLUMN `farmId` int NOT NULL,
  ADD CONSTRAINT `groups_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `groups_species_fk` FOREIGN KEY (`companyId`,`speciesId`) REFERENCES `species` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `groups_category_fk` FOREIGN KEY (`companyId`,`categoryId`) REFERENCES `animal_categories` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `owners`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `owners_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `birth_types`
  DROP INDEX `birth_types_name_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `birth_types_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `feed_items`
  DROP INDEX `feed_items_name_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `feed_items_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `feed_item_price_history`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `feed_item_price_history_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `feed_item_price_history_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `feed_item_price_history_feed_item_fk` FOREIGN KEY (`companyId`,`feedItemId`) REFERENCES `feed_items` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `vaccines`
  DROP INDEX `vaccines_name_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `vaccines_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `vaccination_records`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  MODIFY COLUMN `farmId` int NOT NULL,
  ADD CONSTRAINT `vaccination_records_animal_fk` FOREIGN KEY (`companyId`,`animalId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `vaccination_records_vaccine_fk` FOREIGN KEY (`companyId`,`vaccineId`) REFERENCES `vaccines` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `vaccination_records_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `expense_categories`
  DROP INDEX `expense_categories_name_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `expense_categories_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `expense_sub_categories`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `expense_sub_categories_category_fk` FOREIGN KEY (`companyId`,`categoryId`) REFERENCES `expense_categories` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `system_settings`
  DROP INDEX `system_settings_settingKey_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `system_settings_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `animals`
  DROP INDEX `animals_animalId_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  MODIFY COLUMN `farmId` int NOT NULL,
  ADD CONSTRAINT `animals_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animals_species_fk` FOREIGN KEY (`companyId`,`speciesId`) REFERENCES `species` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animals_category_fk` FOREIGN KEY (`companyId`,`categoryId`) REFERENCES `animal_categories` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animals_group_fk` FOREIGN KEY (`companyId`,`groupId`) REFERENCES `groups` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animals_status_fk` FOREIGN KEY (`companyId`,`statusId`) REFERENCES `animal_statuses` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animals_owner_fk` FOREIGN KEY (`companyId`,`ownerId`) REFERENCES `owners` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animals_dam_fk` FOREIGN KEY (`companyId`,`damId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animals_sire_fk` FOREIGN KEY (`companyId`,`sireId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `animal_status_history`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  MODIFY COLUMN `farmId` int NOT NULL,
  MODIFY COLUMN `animalId` int NULL,
  ADD CONSTRAINT `animal_status_history_animal_fk` FOREIGN KEY (`companyId`,`animalId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animal_status_history_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animal_status_history_previous_status_fk` FOREIGN KEY (`companyId`,`previousStatusId`) REFERENCES `animal_statuses` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `animal_status_history_new_status_fk` FOREIGN KEY (`companyId`,`newStatusId`) REFERENCES `animal_statuses` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `sales`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  MODIFY COLUMN `farmId` int NOT NULL,
  ADD CONSTRAINT `sales_animal_fk` FOREIGN KEY (`companyId`,`animalId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `sales_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `lambing_log`
  DROP INDEX `lambing_log_lambId_unique`,
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  MODIFY COLUMN `farmId` int NOT NULL,
  ADD CONSTRAINT `lambing_log_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `lambing_log_dam_fk` FOREIGN KEY (`companyId`,`damId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `lambing_log_sire_fk` FOREIGN KEY (`companyId`,`sireId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `lambing_log_species_fk` FOREIGN KEY (`companyId`,`speciesId`) REFERENCES `species` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `lambing_log_category_fk` FOREIGN KEY (`companyId`,`categoryId`) REFERENCES `animal_categories` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `lambing_log_group_fk` FOREIGN KEY (`companyId`,`groupId`) REFERENCES `groups` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `lambing_log_birth_type_fk` FOREIGN KEY (`companyId`,`birthTypeId`) REFERENCES `birth_types` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `lambing_log_promoted_animal_fk` FOREIGN KEY (`companyId`,`promotedHeadId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `weight_log`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  MODIFY COLUMN `farmId` int NOT NULL,
  ADD CONSTRAINT `weight_log_animal_fk` FOREIGN KEY (`companyId`,`animalId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `weight_log_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `ration_plans`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `ration_plans_category_fk` FOREIGN KEY (`companyId`,`categoryId`) REFERENCES `animal_categories` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `ration_plans_feed_item_fk` FOREIGN KEY (`companyId`,`feedItemId`) REFERENCES `feed_items` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `ration_plans_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `feed_stock_ledger`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  MODIFY COLUMN `farmId` int NOT NULL,
  ADD CONSTRAINT `feed_stock_ledger_feed_item_fk` FOREIGN KEY (`companyId`,`feedItemId`) REFERENCES `feed_items` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `feed_stock_ledger_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `expenses`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `expenses_category_fk` FOREIGN KEY (`companyId`,`categoryId`) REFERENCES `expense_categories` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `expenses_sub_category_fk` FOREIGN KEY (`companyId`,`subCategoryId`) REFERENCES `expense_sub_categories` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `expenses_head_fk` FOREIGN KEY (`companyId`,`headId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `expenses_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `expenses_scope_check` CHECK ((`scopeType` = 'company' AND `farmId` IS NULL) OR (`scopeType` = 'farm' AND `farmId` IS NOT NULL));
--> statement-breakpoint
ALTER TABLE `pregnancy_records`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  MODIFY COLUMN `farmId` int NOT NULL,
  ADD CONSTRAINT `pregnancy_records_animal_fk` FOREIGN KEY (`companyId`,`animalId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `pregnancy_records_sire_fk` FOREIGN KEY (`companyId`,`sireId`) REFERENCES `animals` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `pregnancy_records_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `pregnancy_records_outcome_fk` FOREIGN KEY (`companyId`,`outcomeLambingLogId`) REFERENCES `lambing_log` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `notifications`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `companyId` int NOT NULL,
  ADD CONSTRAINT `notifications_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `notifications_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `notifications_recipient_fk` FOREIGN KEY (`companyId`,`userId`) REFERENCES `company_memberships` (`companyId`,`userId`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `company_category_sequences`
  ADD CONSTRAINT `company_category_sequences_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `company_category_sequences_category_fk` FOREIGN KEY (`companyId`,`categoryId`) REFERENCES `animal_categories` (`companyId`,`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `notification_receipts`
  ADD CONSTRAINT `notification_receipts_membership_fk` FOREIGN KEY (`companyId`,`companyMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `notification_receipts_notification_fk` FOREIGN KEY (`companyId`,`notificationId`) REFERENCES `notifications` (`companyId`,`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `audit_log`
  MODIFY COLUMN `publicId` varchar(26) NOT NULL,
  MODIFY COLUMN `actorType` enum('tenant_user','platform_admin','support','system_job','migration') NOT NULL,
  MODIFY COLUMN `actionCategory` enum('auth','crud','config','membership','billing','security','data_export','data_delete','company') NOT NULL,
  ADD CONSTRAINT `audit_log_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `audit_log_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `audit_log_membership_fk` FOREIGN KEY (`companyId`,`membershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `audit_log_platform_admin_fk` FOREIGN KEY (`platformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `audit_log_support_grant_fk` FOREIGN KEY (`companyId`,`supportAccessGrantId`) REFERENCES `support_access_grants` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `farms`
  ADD CONSTRAINT `farms_created_by_fk` FOREIGN KEY (`companyId`,`createdByMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `farms_deleted_by_fk` FOREIGN KEY (`companyId`,`deletedByMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `tenant_files`
  ADD CONSTRAINT `tenant_files_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `outbox_events`
  ADD CONSTRAINT `outbox_events_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `outbox_payload_check` CHECK (`payload` IS NOT NULL OR `encryptedPayload` IS NOT NULL);
--> statement-breakpoint
ALTER TABLE `background_jobs`
  ADD CONSTRAINT `background_jobs_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `security_events`
  ADD CONSTRAINT `security_events_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `security_events_platform_admin_fk` FOREIGN KEY (`platformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `security_events_support_grant_fk` FOREIGN KEY (`companyId`,`supportAccessGrantId`) REFERENCES `support_access_grants` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `export_jobs`
  ADD CONSTRAINT `export_jobs_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `export_jobs_membership_fk` FOREIGN KEY (`companyId`,`requestedByMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `export_jobs_platform_admin_fk` FOREIGN KEY (`requestedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `export_jobs_support_grant_fk` FOREIGN KEY (`companyId`,`supportAccessGrantId`) REFERENCES `support_access_grants` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `export_jobs_file_fk` FOREIGN KEY (`companyId`,`tenantFileId`) REFERENCES `tenant_files` (`companyId`,`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `deletion_requests`
  ADD CONSTRAINT `deletion_requests_membership_fk` FOREIGN KEY (`companyId`,`requestedByMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `deletion_requests_request_admin_fk` FOREIGN KEY (`requestedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `deletion_requests_approval_admin_fk` FOREIGN KEY (`approvedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `tenant_restore_jobs`
  ADD CONSTRAINT `tenant_restore_jobs_source_file_fk` FOREIGN KEY (`companyId`,`sourceTenantFileId`) REFERENCES `tenant_files` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `tenant_restore_jobs_pre_export_fk` FOREIGN KEY (`companyId`,`preRestoreExportJobId`) REFERENCES `export_jobs` (`companyId`,`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `tenant_restore_jobs_request_admin_fk` FOREIGN KEY (`requestedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `tenant_restore_jobs_approval_admin_fk` FOREIGN KEY (`approvedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT;
