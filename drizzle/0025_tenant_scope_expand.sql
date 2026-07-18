-- Expand phase. All tenant keys stay nullable until 0026 backfills legacy data.
-- The legacy application may continue reading/writing during this phase only.

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `normalizedEmail` varchar(320) NULL,
  ADD COLUMN IF NOT EXISTS `status` enum('active','locked','disabled') NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS `authVersion` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `failedLoginAttempts` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `lockedUntil` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `lastPasswordChange` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `users_publicId_unique` ON `users` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `users_normalizedEmail_unique` ON `users` (`normalizedEmail`);
--> statement-breakpoint
ALTER TABLE `user_settings`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `user_settings_publicId_unique` ON `user_settings` (`publicId`);
CREATE INDEX IF NOT EXISTS `user_settings_user_company_idx` ON `user_settings` (`userId`,`companyId`);
--> statement-breakpoint
ALTER TABLE `species`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeName` varchar(100) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN LOWER(`name`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `species_publicId_unique` ON `species` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `species_company_id_id_unique` ON `species` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `species_company_active_name_unique` ON `species` (`companyId`,`activeName`);
CREATE INDEX IF NOT EXISTS `species_company_active_idx` ON `species` (`companyId`,`isActive`,`deletedAt`);
--> statement-breakpoint
ALTER TABLE `animal_categories`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeName` varchar(100) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN LOWER(`name`) ELSE NULL END) VIRTUAL,
  ADD COLUMN IF NOT EXISTS `activePrefix` varchar(10) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN UPPER(`idPrefix`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `animal_categories_publicId_unique` ON `animal_categories` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `animal_categories_company_id_id_unique` ON `animal_categories` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `animal_categories_company_active_name_unique` ON `animal_categories` (`companyId`,`activeName`);
CREATE UNIQUE INDEX IF NOT EXISTS `animal_categories_company_active_prefix_unique` ON `animal_categories` (`companyId`,`activePrefix`);
--> statement-breakpoint
ALTER TABLE `animal_statuses`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeName` varchar(100) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN LOWER(`name`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `animal_statuses_publicId_unique` ON `animal_statuses` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `animal_statuses_company_id_id_unique` ON `animal_statuses` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `animal_statuses_company_active_name_unique` ON `animal_statuses` (`companyId`,`activeName`);
--> statement-breakpoint
ALTER TABLE `groups`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeCode` varchar(20) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN UPPER(`groupCode`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `groups_publicId_unique` ON `groups` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `groups_company_id_id_unique` ON `groups` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `groups_farm_active_code_unique` ON `groups` (`companyId`,`farmId`,`activeCode`);
CREATE INDEX IF NOT EXISTS `groups_farm_active_idx` ON `groups` (`companyId`,`farmId`,`isActive`,`deletedAt`);
--> statement-breakpoint
ALTER TABLE `owners`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `owners_publicId_unique` ON `owners` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `owners_company_id_id_unique` ON `owners` (`companyId`,`id`);
CREATE INDEX IF NOT EXISTS `owners_company_active_idx` ON `owners` (`companyId`,`isActive`,`deletedAt`);
--> statement-breakpoint
ALTER TABLE `birth_types`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeName` varchar(50) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN LOWER(`name`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `birth_types_publicId_unique` ON `birth_types` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `birth_types_company_id_id_unique` ON `birth_types` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `birth_types_company_active_name_unique` ON `birth_types` (`companyId`,`activeName`);
--> statement-breakpoint
ALTER TABLE `feed_items`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeName` varchar(100) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN LOWER(`name`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `feed_items_publicId_unique` ON `feed_items` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `feed_items_company_id_id_unique` ON `feed_items` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `feed_items_company_active_name_unique` ON `feed_items` (`companyId`,`activeName`);
--> statement-breakpoint
ALTER TABLE `feed_item_price_history`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `feed_item_price_history_publicId_unique` ON `feed_item_price_history` (`publicId`);
CREATE INDEX IF NOT EXISTS `feed_item_price_history_scope_date_idx` ON `feed_item_price_history` (`companyId`,`farmId`,`feedItemId`,`effectiveDate`,`id`);
--> statement-breakpoint
ALTER TABLE `vaccines`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeName` varchar(100) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN LOWER(`name`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `vaccines_publicId_unique` ON `vaccines` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `vaccines_company_id_id_unique` ON `vaccines` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `vaccines_company_active_name_unique` ON `vaccines` (`companyId`,`activeName`);
--> statement-breakpoint
ALTER TABLE `vaccination_records`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `vaccination_records_publicId_unique` ON `vaccination_records` (`publicId`);
CREATE INDEX IF NOT EXISTS `vaccination_records_tenant_animal_due_idx` ON `vaccination_records` (`companyId`,`farmId`,`animalId`,`nextDueDate`);
--> statement-breakpoint
ALTER TABLE `expense_categories`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeName` varchar(100) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN LOWER(`name`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `expense_categories_publicId_unique` ON `expense_categories` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `expense_categories_company_id_id_unique` ON `expense_categories` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `expense_categories_company_active_name_unique` ON `expense_categories` (`companyId`,`activeName`);
--> statement-breakpoint
ALTER TABLE `expense_sub_categories`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `deletedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `deletedBy` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
ALTER TABLE `expense_sub_categories`
  ADD COLUMN IF NOT EXISTS `activeName` varchar(100) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN LOWER(`name`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `expense_sub_categories_publicId_unique` ON `expense_sub_categories` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `expense_sub_categories_company_id_id_unique` ON `expense_sub_categories` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `expense_sub_categories_parent_active_name_unique` ON `expense_sub_categories` (`companyId`,`categoryId`,`activeName`);
--> statement-breakpoint
ALTER TABLE `system_settings`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `system_settings_publicId_unique` ON `system_settings` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `system_settings_company_key_unique` ON `system_settings` (`companyId`,`settingKey`);
--> statement-breakpoint
ALTER TABLE `animals`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeAnimalCode` varchar(20) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN UPPER(`animalId`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `animals_publicId_unique` ON `animals` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `animals_company_id_id_unique` ON `animals` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `animals_farm_active_code_unique` ON `animals` (`companyId`,`farmId`,`activeAnimalCode`);
CREATE INDEX IF NOT EXISTS `animals_farm_status_idx` ON `animals` (`companyId`,`farmId`,`statusId`,`deletedAt`);
CREATE INDEX IF NOT EXISTS `animals_company_owner_idx` ON `animals` (`companyId`,`ownerId`,`deletedAt`);
--> statement-breakpoint
ALTER TABLE `animal_status_history`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `legacyAnimalId` int NULL,
  ADD COLUMN IF NOT EXISTS `animalPublicIdSnapshot` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `animalCodeSnapshot` varchar(20) NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `animal_status_history_publicId_unique` ON `animal_status_history` (`publicId`);
CREATE INDEX IF NOT EXISTS `animal_status_history_tenant_animal_time_idx` ON `animal_status_history` (`companyId`,`animalId`,`changedAt`,`id`);
--> statement-breakpoint
ALTER TABLE `sales`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `sales_publicId_unique` ON `sales` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `sales_tenant_animal_unique` ON `sales` (`companyId`,`animalId`);
CREATE INDEX IF NOT EXISTS `sales_farm_date_idx` ON `sales` (`companyId`,`farmId`,`saleDate`,`id`);
--> statement-breakpoint
ALTER TABLE `lambing_log`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeLambCode` varchar(20) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN UPPER(`lambId`) ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `lambing_log_publicId_unique` ON `lambing_log` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `lambing_log_company_id_id_unique` ON `lambing_log` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `lambing_log_farm_active_code_unique` ON `lambing_log` (`companyId`,`farmId`,`activeLambCode`);
CREATE INDEX IF NOT EXISTS `lambing_log_farm_date_idx` ON `lambing_log` (`companyId`,`farmId`,`birthDate`,`id`);
--> statement-breakpoint
ALTER TABLE `weight_log`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `weight_log_publicId_unique` ON `weight_log` (`publicId`);
CREATE INDEX IF NOT EXISTS `weight_log_tenant_animal_date_idx` ON `weight_log` (`companyId`,`animalId`,`weighDate`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `weight_log_tenant_session_animal_unique` ON `weight_log` (`companyId`,`sessionId`,`animalId`);
--> statement-breakpoint
ALTER TABLE `ration_plans`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `ration_plans_publicId_unique` ON `ration_plans` (`publicId`);
CREATE INDEX IF NOT EXISTS `ration_plans_scope_active_idx` ON `ration_plans` (`companyId`,`farmId`,`categoryId`,`feedItemId`,`isActive`,`deletedAt`);
--> statement-breakpoint
ALTER TABLE `feed_stock_ledger`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `feed_stock_ledger_publicId_unique` ON `feed_stock_ledger` (`publicId`);
CREATE INDEX IF NOT EXISTS `feed_stock_ledger_farm_item_date_idx` ON `feed_stock_ledger` (`companyId`,`farmId`,`feedItemId`,`transactionDate`,`id`);
--> statement-breakpoint
ALTER TABLE `expenses`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `scopeType` enum('company','farm') NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `expenses_publicId_unique` ON `expenses` (`publicId`);
CREATE INDEX IF NOT EXISTS `expenses_scope_date_idx` ON `expenses` (`companyId`,`scopeType`,`farmId`,`expenseDate`,`id`);
--> statement-breakpoint
ALTER TABLE `pregnancy_records`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activeAnimalGuard` int GENERATED ALWAYS AS (CASE WHEN `status` = 'active' AND `deletedAt` IS NULL THEN `animalId` ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX IF NOT EXISTS `pregnancy_records_publicId_unique` ON `pregnancy_records` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `pregnancy_records_tenant_active_animal_unique` ON `pregnancy_records` (`companyId`,`activeAnimalGuard`);
CREATE INDEX IF NOT EXISTS `pregnancy_records_tenant_due_idx` ON `pregnancy_records` (`companyId`,`farmId`,`status`,`expectedDueDate`);
--> statement-breakpoint
ALTER TABLE `notifications`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `expiresAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `deduplicationKey` varchar(200) NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `notifications_publicId_unique` ON `notifications` (`publicId`);
CREATE UNIQUE INDEX IF NOT EXISTS `notifications_company_id_id_unique` ON `notifications` (`companyId`,`id`);
CREATE UNIQUE INDEX IF NOT EXISTS `notifications_tenant_deduplication_unique` ON `notifications` (`companyId`,`alertType`,`deduplicationKey`);
CREATE INDEX IF NOT EXISTS `notifications_company_time_idx` ON `notifications` (`companyId`,`createdAt`,`id`);
--> statement-breakpoint
ALTER TABLE `audit_log`
  ADD COLUMN IF NOT EXISTS `publicId` varchar(26) NULL,
  ADD COLUMN IF NOT EXISTS `companyId` int NULL,
  ADD COLUMN IF NOT EXISTS `farmId` int NULL,
  ADD COLUMN IF NOT EXISTS `membershipId` int NULL,
  ADD COLUMN IF NOT EXISTS `platformAdministratorId` int NULL,
  ADD COLUMN IF NOT EXISTS `supportAccessGrantId` int NULL,
  ADD COLUMN IF NOT EXISTS `actorType` enum('tenant_user','platform_admin','support','system_job','migration') NULL,
  ADD COLUMN IF NOT EXISTS `actionCategory` enum('auth','crud','config','membership','billing','security','data_export','data_delete','company') NULL,
  ADD COLUMN IF NOT EXISTS `userAgent` varchar(500) NULL,
  ADD COLUMN IF NOT EXISTS `requestId` varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS `outcome` enum('success','denied','error') NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS `metadata` json NULL,
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS `audit_log_publicId_unique` ON `audit_log` (`publicId`);
CREATE INDEX IF NOT EXISTS `audit_log_company_time_idx` ON `audit_log` (`companyId`,`createdAt`,`id`);
CREATE INDEX IF NOT EXISTS `audit_log_actor_time_idx` ON `audit_log` (`actorType`,`platformAdministratorId`,`userId`,`createdAt`);
CREATE INDEX IF NOT EXISTS `audit_log_request_idx` ON `audit_log` (`requestId`);
CREATE INDEX IF NOT EXISTS `audit_log_entity_v2_idx` ON `audit_log` (`companyId`,`entityType`,`entityId`,`createdAt`);
