-- Maintenance-window migration for the existing single-tenant LFMS dataset.
-- Preconditions: writes disabled; 0024 and 0025 applied; verified backup available.

INSERT INTO `companies` (`publicId`,`name`,`slug`,`lifecycleStatus`,`settings`)
VALUES (
  CONCAT('01J', SUBSTRING(UPPER(SHA2('company:azal-farms', 256)), 1, 23)),
  'Azal Farms',
  'azal-farms',
  'active',
  JSON_OBJECT('migrationSource', 'legacy-lfms')
)
ON DUPLICATE KEY UPDATE `id` = LAST_INSERT_ID(`id`);
--> statement-breakpoint
SET @legacyCompanyId := (SELECT `id` FROM `companies` WHERE `slug` = 'azal-farms' LIMIT 1);
--> statement-breakpoint
INSERT INTO `farms` (`publicId`,`companyId`,`name`,`code`,`timezone`,`status`,`settings`)
VALUES (
  CONCAT('01J', SUBSTRING(UPPER(SHA2('farm:azal-farms:main', 256)), 1, 23)),
  @legacyCompanyId,
  'Main Farm',
  'MAIN',
  'Africa/Cairo',
  'active',
  JSON_OBJECT('migrationSource', 'legacy-lfms')
)
ON DUPLICATE KEY UPDATE `id` = LAST_INSERT_ID(`id`);
--> statement-breakpoint
SET @legacyFarmId := (
  SELECT `id` FROM `farms`
  WHERE `companyId` = @legacyCompanyId AND `activeCode` = 'main'
  LIMIT 1
);
--> statement-breakpoint
SET @legacyOwnerUserId := COALESCE(
  (SELECT MIN(`id`) FROM `users` WHERE `role` = 'owner'),
  (SELECT MIN(`id`) FROM `users`)
);
--> statement-breakpoint
UPDATE `users`
SET `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('users:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `users` u
JOIN (
  SELECT LOWER(TRIM(`email`)) AS `normalizedEmail`
  FROM `users`
  WHERE `email` IS NOT NULL AND TRIM(`email`) <> ''
  GROUP BY LOWER(TRIM(`email`))
  HAVING COUNT(*) = 1
) unique_email ON unique_email.`normalizedEmail` = LOWER(TRIM(u.`email`))
SET u.`normalizedEmail` = unique_email.`normalizedEmail`
WHERE u.`normalizedEmail` IS NULL;
--> statement-breakpoint
INSERT INTO `auth_identities` (
  `userId`,`provider`,`providerSubject`,`providerEmail`,`providerEmailVerified`,`linkedAt`
)
SELECT u.`id`, 'manus', u.`openId`, u.`email`, false, u.`createdAt`
FROM `users` u
LEFT JOIN `auth_identities` i
  ON i.`provider` = 'manus' AND i.`providerSubject` = u.`openId`
WHERE i.`id` IS NULL;
--> statement-breakpoint
INSERT INTO `company_memberships` (
  `publicId`,`companyId`,`userId`,`role`,`status`,`farmAccessMode`,`joinedAt`
)
SELECT
  CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('membership:', @legacyCompanyId, ':', u.`id`), 256)), 1, 23)),
  @legacyCompanyId,
  u.`id`,
  CASE
    WHEN u.`id` = @legacyOwnerUserId THEN 'owner'
    WHEN u.`role` = 'owner' THEN 'admin'
    ELSE u.`role`
  END,
  'active',
  'all',
  COALESCE(u.`createdAt`, CURRENT_TIMESTAMP)
FROM `users` u
LEFT JOIN `company_memberships` m
  ON m.`companyId` = @legacyCompanyId AND m.`userId` = u.`id`
WHERE m.`id` IS NULL;
--> statement-breakpoint
SET @legacyOwnerMembershipId := (
  SELECT `id` FROM `company_memberships`
  WHERE `companyId` = @legacyCompanyId AND `role` = 'owner' AND `status` = 'active'
  LIMIT 1
);
--> statement-breakpoint
INSERT INTO `company_role_permissions` (
  `companyId`,`role`,`resource`,`action`,`effect`
)
SELECT
  @legacyCompanyId,
  rp.`role`,
  rp.`page`,
  rp.`action`,
  CASE WHEN rp.`allowed` = true THEN 'allow' ELSE 'deny' END
FROM `role_permissions` rp
ON DUPLICATE KEY UPDATE `effect` = VALUES(`effect`);
--> statement-breakpoint
INSERT INTO `company_security_policies` (`companyId`)
VALUES (@legacyCompanyId)
ON DUPLICATE KEY UPDATE `companyId` = VALUES(`companyId`);
--> statement-breakpoint
UPDATE `user_settings`
SET
  `companyId` = COALESCE(`companyId`, @legacyCompanyId),
  `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('user_settings:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `species`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('species:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `animal_categories`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('animal_categories:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `animal_statuses`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('animal_statuses:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `groups`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('groups:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `owners`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('owners:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `birth_types`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('birth_types:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `feed_items`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('feed_items:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `feed_item_price_history`
SET `companyId` = @legacyCompanyId,
    `farmId` = NULL,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('feed_prices:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `vaccines`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('vaccines:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `vaccination_records`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('vaccination_records:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `expense_categories`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('expense_categories:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `expense_sub_categories`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('expense_sub_categories:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `system_settings`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('system_settings:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `animals`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('animals:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `animal_status_history`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('animal_status_history:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `animal_status_history` h
JOIN `animals` a ON a.`id` = h.`animalId`
SET h.`animalPublicIdSnapshot` = a.`publicId`,
    h.`animalCodeSnapshot` = a.`animalId`;
--> statement-breakpoint
UPDATE `animal_status_history` h
LEFT JOIN `animals` a ON a.`id` = h.`animalId`
SET h.`legacyAnimalId` = h.`animalId`,
    h.`animalId` = NULL
WHERE a.`id` IS NULL;
--> statement-breakpoint
UPDATE `sales`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('sales:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `lambing_log`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('lambing_log:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `weight_log`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('weight_log:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `ration_plans`
SET `companyId` = @legacyCompanyId,
    `farmId` = NULL,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('ration_plans:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `feed_stock_ledger`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('feed_stock_ledger:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `expenses`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `scopeType` = 'farm',
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('expenses:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `pregnancy_records`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('pregnancy_records:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `notifications`
SET `companyId` = @legacyCompanyId,
    `farmId` = @legacyFarmId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('notifications:', `id`), 256)), 1, 23)));
--> statement-breakpoint
UPDATE `audit_log`
SET `companyId` = @legacyCompanyId,
    `publicId` = COALESCE(`publicId`, CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('audit_log:', `id`), 256)), 1, 23))),
    `actorType` = CASE WHEN `userId` IS NULL THEN 'migration' ELSE 'tenant_user' END,
    `actionCategory` = COALESCE(`actionCategory`, 'crud');
--> statement-breakpoint
INSERT IGNORE INTO `tenant_files` (
  `publicId`,`companyId`,`farmId`,`storageKey`,`originalName`,`contentType`,
  `sizeBytes`,`checksumSha256`,`status`,`uploadedByMembershipId`
)
SELECT DISTINCT
  CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('legacy-file:', a.`photoUrl`), 256)), 1, 23)),
  @legacyCompanyId,
  @legacyFarmId,
  a.`photoUrl`,
  COALESCE(NULLIF(SUBSTRING_INDEX(a.`photoUrl`, '/', -1), ''), 'animal-photo'),
  'application/octet-stream',
  0,
  REPEAT('0', 64),
  'quarantine',
  @legacyOwnerMembershipId
FROM `animals` a
WHERE a.`photoUrl` IS NOT NULL AND TRIM(a.`photoUrl`) <> '';
--> statement-breakpoint
INSERT IGNORE INTO `tenant_files` (
  `publicId`,`companyId`,`farmId`,`storageKey`,`originalName`,`contentType`,
  `sizeBytes`,`checksumSha256`,`status`,`uploadedByMembershipId`
)
SELECT
  CONCAT('01J', SUBSTRING(UPPER(SHA2(CONCAT('legacy-file:', s.`settingValue`), 256)), 1, 23)),
  @legacyCompanyId,
  @legacyFarmId,
  s.`settingValue`,
  COALESCE(NULLIF(SUBSTRING_INDEX(s.`settingValue`, '/', -1), ''), 'farm-map'),
  'application/octet-stream',
  0,
  REPEAT('0', 64),
  'quarantine',
  @legacyOwnerMembershipId
FROM `system_settings` s
WHERE s.`settingKey` = 'farmMapImageKey'
  AND s.`settingValue` IS NOT NULL
  AND TRIM(s.`settingValue`) <> '';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `company_category_sequences` (
  `companyId` int NOT NULL,
  `categoryId` int NOT NULL,
  `animalIdSequence` int NOT NULL DEFAULT 0,
  `lambIdSequence` int NOT NULL DEFAULT 0,
  `version` int NOT NULL DEFAULT 1,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`companyId`,`categoryId`)
);
--> statement-breakpoint
INSERT INTO `company_category_sequences` (`companyId`,`categoryId`,`animalIdSequence`,`lambIdSequence`)
SELECT @legacyCompanyId, `id`, `idSequence`, `lambIdSequence`
FROM `animal_categories`
ON DUPLICATE KEY UPDATE
  `animalIdSequence` = GREATEST(`animalIdSequence`, VALUES(`animalIdSequence`)),
  `lambIdSequence` = GREATEST(`lambIdSequence`, VALUES(`lambIdSequence`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_receipts` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `notificationId` int NOT NULL,
  `companyMembershipId` int NOT NULL,
  `deliveredAt` timestamp NULL,
  `readAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_receipts_recipient_unique` (`notificationId`,`companyMembershipId`),
  KEY `notification_receipts_unread_idx` (`companyId`,`companyMembershipId`,`readAt`,`id`)
);
--> statement-breakpoint
INSERT INTO `notification_receipts` (
  `companyId`,`notificationId`,`companyMembershipId`,`deliveredAt`,`readAt`
)
SELECT
  n.`companyId`,
  n.`id`,
  m.`id`,
  n.`createdAt`,
  CASE WHEN n.`isRead` = true THEN n.`createdAt` ELSE NULL END
FROM `notifications` n
JOIN `company_memberships` m
  ON m.`companyId` = n.`companyId`
 AND m.`status` = 'active'
 AND (n.`userId` IS NULL OR n.`userId` = m.`userId`)
ON DUPLICATE KEY UPDATE `readAt` = VALUES(`readAt`);
--> statement-breakpoint
INSERT INTO `feature_catalog` (`publicId`,`code`,`name`,`disabledDataMode`,`limitUnit`)
VALUES
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:core',256)),1,23)), 'core', 'Core Platform', 'inaccessible', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:animals',256)),1,23)), 'animals', 'Animal Registry', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:breeding',256)),1,23)), 'breeding', 'Breeding and Births', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:pregnancy',256)),1,23)), 'pregnancy', 'Pregnancy Tracking', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:fattening',256)),1,23)), 'fattening', 'Fattening and Weights', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:feed',256)),1,23)), 'feed', 'Feed Management', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:vaccinations',256)),1,23)), 'vaccinations', 'Vaccinations', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:expenses',256)),1,23)), 'expenses', 'Expenses', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:reporting',256)),1,23)), 'reporting', 'Reporting', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:sales',256)),1,23)), 'sales', 'Sales', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:notifications',256)),1,23)), 'notifications', 'Notifications', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:audit',256)),1,23)), 'audit', 'Audit Log', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:user_management',256)),1,23)), 'user_management', 'User Management', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:configuration',256)),1,23)), 'configuration', 'Configuration', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:farm_map',256)),1,23)), 'farm_map', 'Farm Map', 'read_only', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:data_transfer',256)),1,23)), 'data_transfer', 'Data Transfer', 'inaccessible', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:data_recovery',256)),1,23)), 'data_recovery', 'Data Recovery', 'inaccessible', 'boolean'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:users_limit',256)),1,23)), 'users_limit', 'Users Limit', 'inaccessible', 'count'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:farms_limit',256)),1,23)), 'farms_limit', 'Farms Limit', 'inaccessible', 'count'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:animals_limit',256)),1,23)), 'animals_limit', 'Animals Limit', 'inaccessible', 'count'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:storage_limit',256)),1,23)), 'storage_limit', 'Storage Limit', 'inaccessible', 'bytes')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
--> statement-breakpoint
INSERT INTO `subscription_plans` (
  `publicId`,`code`,`name`,`description`,`planVersion`,`status`,`publishedAt`
)
VALUES (
  CONCAT('01J', SUBSTRING(UPPER(SHA2('plan:legacy-unlimited:1',256)),1,23)),
  'legacy-unlimited',
  'Legacy Unlimited',
  'Grandfathered plan for the existing Azal Farms dataset.',
  1,
  'active',
  CURRENT_TIMESTAMP
)
ON DUPLICATE KEY UPDATE `id` = LAST_INSERT_ID(`id`);
--> statement-breakpoint
SET @legacyPlanId := (
  SELECT `id` FROM `subscription_plans`
  WHERE `code` = 'legacy-unlimited' AND `planVersion` = 1
  LIMIT 1
);
--> statement-breakpoint
INSERT INTO `plan_entitlements` (`subscriptionPlanId`,`featureId`,`accessMode`,`limitValue`)
SELECT @legacyPlanId, f.`id`, 'enabled', NULL
FROM `feature_catalog` f
ON DUPLICATE KEY UPDATE `accessMode` = 'enabled', `limitValue` = NULL;
--> statement-breakpoint
INSERT INTO `company_subscriptions` (
  `publicId`,`companyId`,`subscriptionPlanId`,`planSnapshot`,`status`,`periodStart`,`periodEnd`,`isCurrent`
)
VALUES (
  CONCAT('01J', SUBSTRING(UPPER(SHA2('subscription:azal-farms:legacy',256)),1,23)),
  @legacyCompanyId,
  @legacyPlanId,
  JSON_OBJECT('code','legacy-unlimited','planVersion',1,'unlimited',true),
  'active',
  CURRENT_TIMESTAMP,
  '2038-01-18 00:00:00',
  true
)
ON DUPLICATE KEY UPDATE `id` = LAST_INSERT_ID(`id`);
--> statement-breakpoint
INSERT INTO `usage_counters` (
  `companyId`,`metricCode`,`periodType`,`periodStart`,`periodEnd`,`usedValue`
)
VALUES
  (@legacyCompanyId, 'farms', 'lifetime', '1970-01-02 00:00:01', '2038-01-18 00:00:00', (SELECT COUNT(*) FROM `farms` WHERE `companyId` = @legacyCompanyId AND `deletedAt` IS NULL)),
  (@legacyCompanyId, 'users', 'lifetime', '1970-01-02 00:00:01', '2038-01-18 00:00:00', (SELECT COUNT(*) FROM `company_memberships` WHERE `companyId` = @legacyCompanyId AND `status` = 'active')),
  (@legacyCompanyId, 'animals', 'lifetime', '1970-01-02 00:00:01', '2038-01-18 00:00:00', (SELECT COUNT(*) FROM `animals` WHERE `companyId` = @legacyCompanyId AND `deletedAt` IS NULL)),
  (@legacyCompanyId, 'storage_bytes', 'lifetime', '1970-01-02 00:00:01', '2038-01-18 00:00:00', 0)
ON DUPLICATE KEY UPDATE `usedValue` = VALUES(`usedValue`);
--> statement-breakpoint
INSERT INTO `platform_permissions` (`code`,`description`)
VALUES
  ('platform.dashboard.read', 'View platform dashboard'),
  ('companies.read', 'View companies'),
  ('companies.write', 'Create and update companies'),
  ('farms.read', 'View farms'),
  ('farms.write', 'Create and update farms'),
  ('memberships.read', 'View company memberships'),
  ('memberships.write', 'Manage company memberships'),
  ('plans.read', 'View plans'),
  ('plans.write', 'Manage plan versions'),
  ('subscriptions.read', 'View subscriptions'),
  ('subscriptions.write', 'Manage subscriptions'),
  ('entitlements.read', 'View feature entitlements'),
  ('entitlements.write', 'Manage feature overrides'),
  ('usage.read', 'View usage and quotas'),
  ('audit.read', 'View audit events'),
  ('audit.export', 'Export audit events'),
  ('security.read', 'View security events'),
  ('administrators.read', 'View platform administrators and roles'),
  ('administrators.write', 'Manage platform administrator status and roles'),
  ('support.request', 'Request tenant support access'),
  ('support.approve', 'Approve tenant support access'),
  ('support.access', 'Use an approved support grant'),
  ('exports.read', 'View export jobs'),
  ('exports.create', 'Create export jobs'),
  ('operations.read', 'View operational health and jobs'),
  ('operations.write', 'Manage operational jobs')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
--> statement-breakpoint
INSERT INTO `platform_roles` (`code`,`name`,`description`,`isSystem`)
VALUES
  ('platform_admin', 'Platform Administrator', 'All explicit platform permissions; assignment is never automatic.', true),
  ('platform_support', 'Platform Support', 'Read-only operations plus controlled support access requests.', true)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `description` = VALUES(`description`);
--> statement-breakpoint
INSERT INTO `platform_role_permissions` (`platformRoleId`,`platformPermissionId`)
SELECT r.`id`, p.`id`
FROM `platform_roles` r
CROSS JOIN `platform_permissions` p
WHERE r.`code` = 'platform_admin'
ON DUPLICATE KEY UPDATE `platformPermissionId` = VALUES(`platformPermissionId`);
--> statement-breakpoint
INSERT INTO `platform_role_permissions` (`platformRoleId`,`platformPermissionId`)
SELECT r.`id`, p.`id`
FROM `platform_roles` r
JOIN `platform_permissions` p ON p.`code` IN (
  'platform.dashboard.read','companies.read','farms.read','memberships.read',
  'plans.read','subscriptions.read','entitlements.read','usage.read','audit.read',
  'security.read','support.request','support.access','exports.read','operations.read'
)
WHERE r.`code` = 'platform_support'
ON DUPLICATE KEY UPDATE `platformPermissionId` = VALUES(`platformPermissionId`);
