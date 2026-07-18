-- Roll back the Azal Farms legacy mapping after 0027 rollback.
-- Preconditions: writes disabled; no second company; no post-cutover records.

SET @legacyCompanyId := (SELECT `id` FROM `companies` WHERE `slug` = 'azal-farms' LIMIT 1);
DELETE FROM `notification_receipts` WHERE `companyId` = @legacyCompanyId;
DROP TABLE `notification_receipts`;
DELETE FROM `company_category_sequences` WHERE `companyId` = @legacyCompanyId;
DROP TABLE `company_category_sequences`;
DELETE FROM `usage_counters` WHERE `companyId` = @legacyCompanyId;
DELETE FROM `tenant_files` WHERE `companyId` = @legacyCompanyId AND `sizeBytes` = 0 AND `checksumSha256` = REPEAT('0', 64);
DELETE FROM `company_subscriptions` WHERE `companyId` = @legacyCompanyId;
DELETE FROM `plan_entitlements` WHERE `subscriptionPlanId` IN (SELECT `id` FROM `subscription_plans` WHERE `code` = 'legacy-unlimited');
DELETE FROM `subscription_plans` WHERE `code` = 'legacy-unlimited';
DELETE FROM `feature_catalog` WHERE `code` IN (
  'core','animals','breeding','pregnancy','fattening','feed','vaccinations','expenses',
  'reporting','sales','notifications','audit','user_management','configuration','farm_map',
  'data_transfer','data_recovery','users_limit','farms_limit','animals_limit','storage_limit'
);
DELETE prp FROM `platform_role_permissions` prp
JOIN `platform_roles` pr ON pr.`id` = prp.`platformRoleId`
WHERE pr.`code` IN ('platform_admin','platform_support');
DELETE FROM `platform_roles` WHERE `code` IN ('platform_admin','platform_support');
DELETE FROM `platform_permissions`;
DELETE FROM `company_role_permissions` WHERE `companyId` = @legacyCompanyId;
DELETE FROM `company_security_policies` WHERE `companyId` = @legacyCompanyId;
DELETE FROM `company_memberships` WHERE `companyId` = @legacyCompanyId;
DELETE FROM `auth_identities` WHERE `provider` = 'manus';

UPDATE `user_settings` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `species` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `animal_categories` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `animal_statuses` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `groups` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `owners` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `birth_types` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `feed_items` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `feed_item_price_history` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `vaccines` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `vaccination_records` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `expense_categories` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `expense_sub_categories` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `system_settings` SET `companyId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `animals` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `animal_status_history` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `sales` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `lambing_log` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `weight_log` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `ration_plans` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `feed_stock_ledger` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `expenses` SET `companyId` = NULL, `farmId` = NULL, `scopeType` = 'company', `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `pregnancy_records` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `notifications` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `audit_log` SET `companyId` = NULL, `farmId` = NULL, `publicId` = NULL, `actorType` = NULL, `actionCategory` = NULL WHERE `companyId` = @legacyCompanyId;
UPDATE `users` SET `publicId` = NULL, `normalizedEmail` = NULL;

DELETE FROM `farms` WHERE `companyId` = @legacyCompanyId;
DELETE FROM `companies` WHERE `id` = @legacyCompanyId;
