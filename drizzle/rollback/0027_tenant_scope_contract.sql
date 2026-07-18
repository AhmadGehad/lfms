-- Roll back the contract phase only.
-- Preconditions: writes disabled; exactly one company exists; no post-cutover data.

ALTER TABLE `notification_receipts`
  DROP FOREIGN KEY `notification_receipts_membership_fk`,
  DROP FOREIGN KEY `notification_receipts_notification_fk`;
ALTER TABLE `company_category_sequences`
  DROP FOREIGN KEY `company_category_sequences_company_fk`,
  DROP FOREIGN KEY `company_category_sequences_category_fk`;
ALTER TABLE `tenant_restore_jobs`
  DROP FOREIGN KEY `tenant_restore_jobs_source_file_fk`,
  DROP FOREIGN KEY `tenant_restore_jobs_pre_export_fk`,
  DROP FOREIGN KEY `tenant_restore_jobs_request_admin_fk`,
  DROP FOREIGN KEY `tenant_restore_jobs_approval_admin_fk`;
ALTER TABLE `deletion_requests`
  DROP FOREIGN KEY `deletion_requests_membership_fk`,
  DROP FOREIGN KEY `deletion_requests_request_admin_fk`,
  DROP FOREIGN KEY `deletion_requests_approval_admin_fk`;
ALTER TABLE `export_jobs`
  DROP FOREIGN KEY `export_jobs_farm_fk`,
  DROP FOREIGN KEY `export_jobs_membership_fk`,
  DROP FOREIGN KEY `export_jobs_platform_admin_fk`,
  DROP FOREIGN KEY `export_jobs_support_grant_fk`,
  DROP FOREIGN KEY `export_jobs_file_fk`;
ALTER TABLE `security_events`
  DROP FOREIGN KEY `security_events_company_fk`,
  DROP FOREIGN KEY `security_events_platform_admin_fk`,
  DROP FOREIGN KEY `security_events_support_grant_fk`;
ALTER TABLE `background_jobs` DROP FOREIGN KEY `background_jobs_company_fk`;
ALTER TABLE `outbox_events` DROP FOREIGN KEY `outbox_events_company_fk`, DROP CONSTRAINT `outbox_payload_check`;
ALTER TABLE `tenant_files` DROP FOREIGN KEY `tenant_files_farm_fk`;
ALTER TABLE `farms` DROP FOREIGN KEY `farms_created_by_fk`, DROP FOREIGN KEY `farms_deleted_by_fk`;

ALTER TABLE `audit_log`
  DROP FOREIGN KEY `audit_log_company_fk`,
  DROP FOREIGN KEY `audit_log_farm_fk`,
  DROP FOREIGN KEY `audit_log_membership_fk`,
  DROP FOREIGN KEY `audit_log_platform_admin_fk`,
  DROP FOREIGN KEY `audit_log_support_grant_fk`,
  MODIFY COLUMN `publicId` varchar(26) NULL,
  MODIFY COLUMN `actorType` enum('tenant_user','platform_admin','support','system_job','migration') NULL,
  MODIFY COLUMN `actionCategory` enum('auth','crud','config','membership','billing','security','data_export','data_delete','company') NULL;
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_company_fk`, DROP FOREIGN KEY `notifications_farm_fk`, DROP FOREIGN KEY `notifications_recipient_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `pregnancy_records` DROP FOREIGN KEY `pregnancy_records_animal_fk`, DROP FOREIGN KEY `pregnancy_records_sire_fk`, DROP FOREIGN KEY `pregnancy_records_farm_fk`, DROP FOREIGN KEY `pregnancy_records_outcome_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `farmId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `vaccination_records` DROP FOREIGN KEY `vaccination_records_animal_fk`, DROP FOREIGN KEY `vaccination_records_vaccine_fk`, DROP FOREIGN KEY `vaccination_records_farm_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `farmId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD CONSTRAINT `vaccination_records_animalId_fk` FOREIGN KEY (`animalId`) REFERENCES `animals` (`id`) ON DELETE CASCADE, ADD CONSTRAINT `vaccination_records_vaccineId_fk` FOREIGN KEY (`vaccineId`) REFERENCES `vaccines` (`id`) ON DELETE CASCADE;
ALTER TABLE `expenses` DROP FOREIGN KEY `expenses_category_fk`, DROP FOREIGN KEY `expenses_sub_category_fk`, DROP FOREIGN KEY `expenses_head_fk`, DROP FOREIGN KEY `expenses_farm_fk`, DROP CONSTRAINT `expenses_scope_check`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `feed_stock_ledger` DROP FOREIGN KEY `feed_stock_ledger_feed_item_fk`, DROP FOREIGN KEY `feed_stock_ledger_farm_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `farmId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `ration_plans` DROP FOREIGN KEY `ration_plans_category_fk`, DROP FOREIGN KEY `ration_plans_feed_item_fk`, DROP FOREIGN KEY `ration_plans_farm_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `weight_log` DROP FOREIGN KEY `weight_log_animal_fk`, DROP FOREIGN KEY `weight_log_farm_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `farmId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `lambing_log` DROP FOREIGN KEY `lambing_log_farm_fk`, DROP FOREIGN KEY `lambing_log_dam_fk`, DROP FOREIGN KEY `lambing_log_sire_fk`, DROP FOREIGN KEY `lambing_log_species_fk`, DROP FOREIGN KEY `lambing_log_category_fk`, DROP FOREIGN KEY `lambing_log_group_fk`, DROP FOREIGN KEY `lambing_log_birth_type_fk`, DROP FOREIGN KEY `lambing_log_promoted_animal_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `farmId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `lambing_log_lambId_unique` (`lambId`);
ALTER TABLE `sales` DROP FOREIGN KEY `sales_animal_fk`, DROP FOREIGN KEY `sales_farm_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `farmId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `animal_status_history` DROP FOREIGN KEY `animal_status_history_animal_fk`, DROP FOREIGN KEY `animal_status_history_farm_fk`, DROP FOREIGN KEY `animal_status_history_previous_status_fk`, DROP FOREIGN KEY `animal_status_history_new_status_fk`;
UPDATE `animal_status_history` SET `animalId` = `legacyAnimalId` WHERE `animalId` IS NULL AND `legacyAnimalId` IS NOT NULL;
ALTER TABLE `animal_status_history` MODIFY COLUMN `animalId` int NOT NULL, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `farmId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `animals` DROP FOREIGN KEY `animals_farm_fk`, DROP FOREIGN KEY `animals_species_fk`, DROP FOREIGN KEY `animals_category_fk`, DROP FOREIGN KEY `animals_group_fk`, DROP FOREIGN KEY `animals_status_fk`, DROP FOREIGN KEY `animals_owner_fk`, DROP FOREIGN KEY `animals_dam_fk`, DROP FOREIGN KEY `animals_sire_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `farmId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `animals_animalId_unique` (`animalId`), ADD CONSTRAINT `animals_ownerId_fk` FOREIGN KEY (`ownerId`) REFERENCES `owners` (`id`) ON DELETE SET NULL;
ALTER TABLE `system_settings` DROP FOREIGN KEY `system_settings_company_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `system_settings_settingKey_unique` (`settingKey`);
ALTER TABLE `expense_sub_categories` DROP FOREIGN KEY `expense_sub_categories_category_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `expense_categories` DROP FOREIGN KEY `expense_categories_company_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `expense_categories_name_unique` (`name`);
ALTER TABLE `vaccines` DROP FOREIGN KEY `vaccines_company_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `vaccines_name_unique` (`name`);
ALTER TABLE `feed_item_price_history` DROP FOREIGN KEY `feed_item_price_history_company_fk`, DROP FOREIGN KEY `feed_item_price_history_farm_fk`, DROP FOREIGN KEY `feed_item_price_history_feed_item_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `feed_items` DROP FOREIGN KEY `feed_items_company_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `feed_items_name_unique` (`name`);
ALTER TABLE `birth_types` DROP FOREIGN KEY `birth_types_company_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `birth_types_name_unique` (`name`);
ALTER TABLE `owners` DROP FOREIGN KEY `owners_company_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `groups` DROP FOREIGN KEY `groups_farm_fk`, DROP FOREIGN KEY `groups_species_fk`, DROP FOREIGN KEY `groups_category_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `farmId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `groups_groupCode_unique` (`groupCode`);
ALTER TABLE `animal_statuses` DROP FOREIGN KEY `animal_statuses_company_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `animal_statuses_name_unique` (`name`);
ALTER TABLE `animal_categories` DROP FOREIGN KEY `animal_categories_company_fk`, DROP FOREIGN KEY `animal_categories_species_fk`, DROP FOREIGN KEY `animal_categories_auto_target_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL;
ALTER TABLE `species` DROP FOREIGN KEY `species_company_fk`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `species_name_unique` (`name`);
ALTER TABLE `user_settings` DROP FOREIGN KEY `user_settings_company_fk`, DROP FOREIGN KEY `user_settings_user_fk`, DROP INDEX `user_settings_company_user_key_unique`, MODIFY COLUMN `companyId` int NULL, MODIFY COLUMN `publicId` varchar(26) NULL, ADD UNIQUE KEY `user_settings_user_key_unique` (`userId`,`settingKey`);
ALTER TABLE `users` MODIFY COLUMN `publicId` varchar(26) NULL;
