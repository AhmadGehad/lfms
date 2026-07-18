-- SaaS control-plane foundation. Additive only: no legacy LFMS table is changed here.
-- Apply before 0025_tenant_scope_expand.sql.

CREATE TABLE IF NOT EXISTS `saas_schema_migrations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `version` varchar(100) NOT NULL,
  `checksumSha256` varchar(64) NOT NULL,
  `executionId` varchar(26) NOT NULL,
  `appliedBy` varchar(200) NOT NULL,
  `appliedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `saas_schema_migrations_version_unique` (`version`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `companies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `name` varchar(200) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `lifecycleStatus` enum('provisioning','active','suspended','deletion_requested','purging','deleted') NOT NULL DEFAULT 'provisioning',
  `settings` json,
  `entitlementVersion` int NOT NULL DEFAULT 1,
  `version` int NOT NULL DEFAULT 1,
  `suspendedAt` timestamp NULL,
  `suspendedReason` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `companies_publicId_unique` (`publicId`),
  UNIQUE KEY `companies_slug_unique` (`slug`),
  KEY `companies_lifecycle_idx` (`lifecycleStatus`,`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `farms` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int NOT NULL,
  `name` varchar(200) NOT NULL,
  `code` varchar(40) NOT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'UTC',
  `latitude` decimal(10,7),
  `longitude` decimal(10,7),
  `status` enum('active','suspended','archived') NOT NULL DEFAULT 'active',
  `settings` json,
  `version` int NOT NULL DEFAULT 1,
  `createdByMembershipId` int,
  `deletedByMembershipId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  `activeCode` varchar(40) GENERATED ALWAYS AS (CASE WHEN `deletedAt` IS NULL THEN LOWER(`code`) ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `farms_publicId_unique` (`publicId`),
  UNIQUE KEY `farms_company_id_id_unique` (`companyId`,`id`),
  UNIQUE KEY `farms_company_active_code_unique` (`companyId`,`activeCode`),
  KEY `farms_company_status_idx` (`companyId`,`status`,`id`),
  CONSTRAINT `farms_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `company_memberships` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('owner','supervisor','staff','admin','user','viewer') NOT NULL DEFAULT 'viewer',
  `status` enum('invited','active','suspended','removed') NOT NULL DEFAULT 'invited',
  `farmAccessMode` enum('all','restricted') NOT NULL DEFAULT 'restricted',
  `authorizationVersion` int NOT NULL DEFAULT 1,
  `version` int NOT NULL DEFAULT 1,
  `invitedByMembershipId` int,
  `joinedAt` timestamp NULL,
  `removedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ownerCompanyGuard` int GENERATED ALWAYS AS (CASE WHEN `role` = 'owner' AND `status` = 'active' THEN `companyId` ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_memberships_publicId_unique` (`publicId`),
  UNIQUE KEY `company_memberships_company_id_id_unique` (`companyId`,`id`),
  UNIQUE KEY `company_memberships_company_user_unique` (`companyId`,`userId`),
  UNIQUE KEY `company_memberships_owner_guard_unique` (`ownerCompanyGuard`),
  KEY `company_memberships_user_status_idx` (`userId`,`status`,`companyId`),
  CONSTRAINT `company_memberships_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `company_memberships_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `company_memberships_invited_by_fk` FOREIGN KEY (`companyId`,`invitedByMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `farm_memberships` (
  `companyId` int NOT NULL,
  `companyMembershipId` int NOT NULL,
  `farmId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`companyMembershipId`,`farmId`),
  CONSTRAINT `farm_memberships_company_farm_fk` FOREIGN KEY (`companyId`,`farmId`) REFERENCES `farms` (`companyId`,`id`) ON DELETE CASCADE,
  CONSTRAINT `farm_memberships_company_membership_fk` FOREIGN KEY (`companyId`,`companyMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `company_invitations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int NOT NULL,
  `normalizedEmail` varchar(320) NOT NULL,
  `role` enum('owner','supervisor','staff','admin','user','viewer') NOT NULL DEFAULT 'viewer',
  `farmAccessMode` enum('all','restricted') NOT NULL DEFAULT 'restricted',
  `tokenHash` binary(32) NOT NULL,
  `status` enum('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
  `invitedByMembershipId` int NOT NULL,
  `acceptedByUserId` int,
  `expiresAt` timestamp NOT NULL,
  `acceptedAt` timestamp NULL,
  `revokedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `activeEmail` varchar(320) GENERATED ALWAYS AS (CASE WHEN `status` = 'pending' THEN `normalizedEmail` ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_invitations_publicId_unique` (`publicId`),
  UNIQUE KEY `company_invitations_tokenHash_unique` (`tokenHash`),
  UNIQUE KEY `company_invitations_active_email_unique` (`companyId`,`activeEmail`),
  KEY `company_invitations_company_status_idx` (`companyId`,`status`,`expiresAt`),
  CONSTRAINT `company_invitations_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `company_invitations_inviter_fk` FOREIGN KEY (`companyId`,`invitedByMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE RESTRICT,
  CONSTRAINT `company_invitations_accepted_by_fk` FOREIGN KEY (`acceptedByUserId`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `company_role_permissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `role` enum('owner','supervisor','staff','admin','user','viewer') NOT NULL,
  `resource` varchar(100) NOT NULL,
  `action` varchar(100) NOT NULL,
  `effect` enum('allow','deny') NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `updatedByMembershipId` int,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_role_permissions_scope_unique` (`companyId`,`role`,`resource`,`action`),
  CONSTRAINT `company_role_permissions_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `company_role_permissions_updated_by_fk` FOREIGN KEY (`companyId`,`updatedByMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `company_security_policies` (
  `companyId` int NOT NULL,
  `requireMfa` boolean NOT NULL DEFAULT false,
  `allowedMfaMethods` json,
  `privilegedSessionMaxAgeSeconds` int NOT NULL DEFAULT 900,
  `requireMfaForOwners` boolean NOT NULL DEFAULT true,
  `requireMfaForBilling` boolean NOT NULL DEFAULT true,
  `requireMfaForDataExport` boolean NOT NULL DEFAULT false,
  `updatedByMembershipId` int,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`companyId`),
  CONSTRAINT `company_security_policies_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `company_security_policies_updated_by_fk` FOREIGN KEY (`companyId`,`updatedByMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_identities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `provider` varchar(50) NOT NULL,
  `providerSubject` varchar(255),
  `providerEmail` varchar(320),
  `providerEmailVerified` boolean NOT NULL DEFAULT false,
  `linkedAt` timestamp NULL,
  `lastUsedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_identities_provider_subject_unique` (`provider`,`providerSubject`),
  UNIQUE KEY `auth_identities_user_provider_unique` (`userId`,`provider`),
  UNIQUE KEY `auth_identities_user_id_id_unique` (`userId`,`id`),
  CONSTRAINT `auth_identities_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `password_credentials` (
  `userId` int NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `passwordChangedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `passwordNeedsRehash` boolean NOT NULL DEFAULT false,
  PRIMARY KEY (`userId`),
  CONSTRAINT `password_credentials_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `authentication_tokens` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `authIdentityId` int,
  `purpose` enum('verify_email','reset_password','change_email','identity_link') NOT NULL,
  `tokenHash` binary(32) NOT NULL,
  `targetValue` varchar(320),
  `attempts` int NOT NULL DEFAULT 0,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `authentication_tokens_tokenHash_unique` (`tokenHash`),
  KEY `authentication_tokens_lookup_idx` (`userId`,`purpose`,`expiresAt`),
  CONSTRAINT `authentication_tokens_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `authentication_tokens_identity_fk` FOREIGN KEY (`authIdentityId`) REFERENCES `auth_identities` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mfa_credentials` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `method` enum('totp') NOT NULL,
  `encryptedSecret` text NOT NULL,
  `encryptionKeyVersion` varchar(50) NOT NULL,
  `lastUsedTotpStep` bigint,
  `enabledAt` timestamp NULL,
  `disabledAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mfa_credentials_user_method_unique` (`userId`,`method`),
  CONSTRAINT `mfa_credentials_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mfa_recovery_codes` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `mfaCredentialId` bigint NOT NULL,
  `codeHash` varchar(255) NOT NULL,
  `usedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `mfa_recovery_codes_credential_idx` (`mfaCredentialId`,`usedAt`),
  CONSTRAINT `mfa_recovery_codes_credential_fk` FOREIGN KEY (`mfaCredentialId`) REFERENCES `mfa_credentials` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `tokenHash` varchar(128) NOT NULL,
  `tokenFamilyId` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `lastSelectedCompanyId` int,
  `authLevel` enum('primary','mfa','step_up') NOT NULL DEFAULT 'primary',
  `mfaVerifiedAt` timestamp NULL,
  `authenticationMethods` json,
  `userAuthVersion` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `idleExpiresAt` timestamp NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `revokedAt` timestamp NULL,
  `revokedReason` varchar(200),
  `ipAddress` varchar(45),
  `userAgent` varchar(500),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_sessions_publicId_unique` (`publicId`),
  UNIQUE KEY `tenant_sessions_tokenHash_unique` (`tokenHash`),
  KEY `tenant_sessions_active_user_idx` (`userId`,`revokedAt`,`expiresAt`),
  KEY `tenant_sessions_family_idx` (`tokenFamilyId`,`revokedAt`),
  CONSTRAINT `tenant_sessions_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tenant_sessions_last_company_fk` FOREIGN KEY (`lastSelectedCompanyId`) REFERENCES `companies` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_rate_limits` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `keyHash` varchar(64) NOT NULL,
  `bucketStart` timestamp NOT NULL,
  `count` int NOT NULL DEFAULT 0,
  `expiresAt` timestamp NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_rate_limits_bucket_unique` (`keyHash`,`bucketStart`),
  KEY `auth_rate_limits_expiry_idx` (`expiresAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `oauth_states` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `stateHash` varchar(64) NOT NULL,
  `audience` enum('tenant','platform') NOT NULL,
  `redirectUri` varchar(500) NOT NULL,
  `returnTo` varchar(500) NOT NULL,
  `browserBindingHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `oauth_states_stateHash_unique` (`stateHash`),
  KEY `oauth_states_expiry_idx` (`expiresAt`,`consumedAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_administrators` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `userId` int NOT NULL,
  `status` enum('invited','active','suspended','revoked') NOT NULL DEFAULT 'invited',
  `authVersion` int NOT NULL DEFAULT 1,
  `mfaRequired` boolean NOT NULL DEFAULT true,
  `version` int NOT NULL DEFAULT 1,
  `grantedByPlatformAdministratorId` int,
  `grantedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedAt` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_administrators_publicId_unique` (`publicId`),
  UNIQUE KEY `platform_administrators_userId_unique` (`userId`),
  KEY `platform_administrators_status_idx` (`status`,`id`),
  CONSTRAINT `platform_administrators_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `platform_administrators_granted_by_fk` FOREIGN KEY (`grantedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_identities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `platformAdministratorId` int NOT NULL,
  `provider` varchar(50) NOT NULL,
  `providerSubject` varchar(255) NOT NULL,
  `providerEmail` varchar(320),
  `providerEmailVerified` boolean NOT NULL DEFAULT false,
  `lastUsedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_identities_provider_subject_unique` (`provider`,`providerSubject`),
  UNIQUE KEY `platform_identities_admin_provider_unique` (`platformAdministratorId`,`provider`),
  CONSTRAINT `platform_identities_administrator_fk` FOREIGN KEY (`platformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_roles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `code` varchar(100) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text,
  `isSystem` boolean NOT NULL DEFAULT false,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_roles_code_unique` (`code`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_permissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `code` varchar(120) NOT NULL,
  `description` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_permissions_code_unique` (`code`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_administrator_roles` (
  `platformAdministratorId` int NOT NULL,
  `platformRoleId` int NOT NULL,
  `grantedByPlatformAdministratorId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`platformAdministratorId`,`platformRoleId`),
  CONSTRAINT `platform_administrator_roles_administrator_fk` FOREIGN KEY (`platformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE CASCADE,
  CONSTRAINT `platform_administrator_roles_role_fk` FOREIGN KEY (`platformRoleId`) REFERENCES `platform_roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `platform_administrator_roles_granted_by_fk` FOREIGN KEY (`grantedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_role_permissions` (
  `platformRoleId` int NOT NULL,
  `platformPermissionId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`platformRoleId`,`platformPermissionId`),
  CONSTRAINT `platform_role_permissions_role_fk` FOREIGN KEY (`platformRoleId`) REFERENCES `platform_roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `platform_role_permissions_permission_fk` FOREIGN KEY (`platformPermissionId`) REFERENCES `platform_permissions` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `tokenHash` varchar(128) NOT NULL,
  `tokenFamilyId` varchar(64) NOT NULL,
  `platformAdministratorId` int NOT NULL,
  `authLevel` enum('primary','mfa','step_up') NOT NULL DEFAULT 'primary',
  `mfaVerifiedAt` timestamp NULL,
  `authenticationMethods` json,
  `authVersion` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `idleExpiresAt` timestamp NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `revokedAt` timestamp NULL,
  `revokedReason` varchar(200),
  `ipAddress` varchar(45),
  `userAgent` varchar(500),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_sessions_publicId_unique` (`publicId`),
  UNIQUE KEY `platform_sessions_tokenHash_unique` (`tokenHash`),
  KEY `platform_sessions_active_admin_idx` (`platformAdministratorId`,`revokedAt`,`expiresAt`),
  KEY `platform_sessions_family_idx` (`tokenFamilyId`,`revokedAt`),
  CONSTRAINT `platform_sessions_administrator_fk` FOREIGN KEY (`platformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `feature_catalog` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `code` varchar(100) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text,
  `status` enum('active','deprecated') NOT NULL DEFAULT 'active',
  `disabledDataMode` enum('read_only','hidden','inaccessible') NOT NULL DEFAULT 'read_only',
  `limitUnit` enum('boolean','count','bytes','requests') NOT NULL DEFAULT 'boolean',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `feature_catalog_publicId_unique` (`publicId`),
  UNIQUE KEY `feature_catalog_code_unique` (`code`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `code` varchar(80) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text,
  `planVersion` int NOT NULL DEFAULT 1,
  `status` enum('draft','active','retired') NOT NULL DEFAULT 'draft',
  `priceMonthly` decimal(12,2) NOT NULL DEFAULT 0,
  `priceYearly` decimal(12,2) NOT NULL DEFAULT 0,
  `currency` varchar(3) NOT NULL DEFAULT 'USD',
  `createdByPlatformAdministratorId` int,
  `publishedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `subscription_plans_publicId_unique` (`publicId`),
  UNIQUE KEY `subscription_plans_code_version_unique` (`code`,`planVersion`),
  KEY `subscription_plans_status_idx` (`status`,`code`,`planVersion`),
  CONSTRAINT `subscription_plans_created_by_fk` FOREIGN KEY (`createdByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `plan_entitlements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `subscriptionPlanId` int NOT NULL,
  `featureId` int NOT NULL,
  `accessMode` enum('enabled','read_only','disabled') NOT NULL DEFAULT 'disabled',
  `limitValue` bigint,
  `configuration` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `plan_entitlements_plan_feature_unique` (`subscriptionPlanId`,`featureId`),
  CONSTRAINT `plan_entitlements_plan_fk` FOREIGN KEY (`subscriptionPlanId`) REFERENCES `subscription_plans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `plan_entitlements_feature_fk` FOREIGN KEY (`featureId`) REFERENCES `feature_catalog` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `company_subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int NOT NULL,
  `subscriptionPlanId` int NOT NULL,
  `planSnapshot` json NOT NULL,
  `status` enum('trialing','active','past_due','suspended','canceled','expired') NOT NULL DEFAULT 'trialing',
  `periodStart` timestamp NOT NULL,
  `periodEnd` timestamp NOT NULL,
  `trialEndsAt` timestamp NULL,
  `graceEndsAt` timestamp NULL,
  `canceledAt` timestamp NULL,
  `isCurrent` boolean NOT NULL DEFAULT true,
  `version` int NOT NULL DEFAULT 1,
  `changedByPlatformAdministratorId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `currentCompanyGuard` int GENERATED ALWAYS AS (CASE WHEN `isCurrent` = TRUE THEN `companyId` ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_subscriptions_publicId_unique` (`publicId`),
  UNIQUE KEY `company_subscriptions_current_company_unique` (`currentCompanyGuard`),
  KEY `company_subscriptions_history_idx` (`companyId`,`createdAt`,`id`),
  KEY `company_subscriptions_expiry_idx` (`status`,`periodEnd`,`id`),
  KEY `company_subscriptions_trial_expiry_idx` (`status`,`trialEndsAt`,`id`),
  KEY `company_subscriptions_grace_expiry_idx` (`status`,`graceEndsAt`,`id`),
  CONSTRAINT `company_subscriptions_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `company_subscriptions_plan_fk` FOREIGN KEY (`subscriptionPlanId`) REFERENCES `subscription_plans` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `company_subscriptions_changed_by_fk` FOREIGN KEY (`changedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `company_feature_overrides` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int NOT NULL,
  `featureId` int NOT NULL,
  `accessMode` enum('enabled','read_only','disabled'),
  `limitValue` bigint,
  `configuration` json,
  `reason` text NOT NULL,
  `startsAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` timestamp NULL,
  `isCurrent` boolean NOT NULL DEFAULT true,
  `version` int NOT NULL DEFAULT 1,
  `createdByPlatformAdministratorId` int NOT NULL,
  `revokedByPlatformAdministratorId` int,
  `revokedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `currentCompanyFeatureGuard` varchar(80) GENERATED ALWAYS AS (CASE WHEN `isCurrent` = TRUE THEN CONCAT(`companyId`, ':', `featureId`) ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_feature_overrides_publicId_unique` (`publicId`),
  UNIQUE KEY `company_feature_overrides_current_unique` (`currentCompanyFeatureGuard`),
  KEY `company_feature_overrides_company_expiry_idx` (`companyId`,`isCurrent`,`expiresAt`),
  CONSTRAINT `company_feature_overrides_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `company_feature_overrides_feature_fk` FOREIGN KEY (`featureId`) REFERENCES `feature_catalog` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `company_feature_overrides_created_by_fk` FOREIGN KEY (`createdByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `company_feature_overrides_revoked_by_fk` FOREIGN KEY (`revokedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `usage_counters` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `featureId` int,
  `metricCode` varchar(100) NOT NULL,
  `periodType` enum('lifetime','daily','monthly','billing_period') NOT NULL,
  `periodStart` timestamp NOT NULL,
  `periodEnd` timestamp NOT NULL,
  `usedValue` bigint NOT NULL DEFAULT 0,
  `reservedValue` bigint NOT NULL DEFAULT 0,
  `version` int NOT NULL DEFAULT 1,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usage_counters_metric_period_unique` (`companyId`,`metricCode`,`periodType`,`periodStart`,`periodEnd`),
  KEY `usage_counters_period_idx` (`periodType`,`periodEnd`,`companyId`),
  CONSTRAINT `usage_counters_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `usage_counters_feature_fk` FOREIGN KEY (`featureId`) REFERENCES `feature_catalog` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `support_access_grants` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int NOT NULL,
  `requestedByPlatformAdministratorId` int NOT NULL,
  `accessMode` enum('read_only','write') NOT NULL DEFAULT 'read_only',
  `allowedScopes` json NOT NULL,
  `reason` text NOT NULL,
  `ticketReference` varchar(150) NOT NULL,
  `status` enum('pending','approved','active','expired','revoked','rejected') NOT NULL DEFAULT 'pending',
  `activatedAt` timestamp NULL,
  `expiresAt` timestamp NOT NULL,
  `revokedAt` timestamp NULL,
  `revokedByPlatformAdministratorId` int,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `activeCompanyTicketGuard` varchar(200) GENERATED ALWAYS AS (CASE WHEN `status` IN ('pending','approved','active') THEN CONCAT(`companyId`, ':', LOWER(`ticketReference`)) ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `support_access_grants_publicId_unique` (`publicId`),
  UNIQUE KEY `support_access_grants_company_id_id_unique` (`companyId`,`id`),
  UNIQUE KEY `support_access_grants_active_ticket_unique` (`activeCompanyTicketGuard`),
  KEY `support_access_grants_company_status_idx` (`companyId`,`status`,`expiresAt`),
  KEY `support_access_grants_requester_status_idx` (`requestedByPlatformAdministratorId`,`status`,`createdAt`),
  CONSTRAINT `support_access_grants_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `support_access_grants_requester_fk` FOREIGN KEY (`requestedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `support_access_grants_revoked_by_fk` FOREIGN KEY (`revokedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `support_access_approvals` (
  `id` int AUTO_INCREMENT NOT NULL,
  `supportAccessGrantId` int NOT NULL,
  `platformAdministratorId` int NOT NULL,
  `decision` enum('approved','rejected') NOT NULL,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `support_access_approvals_approver_unique` (`supportAccessGrantId`,`platformAdministratorId`),
  CONSTRAINT `support_access_approvals_grant_fk` FOREIGN KEY (`supportAccessGrantId`) REFERENCES `support_access_grants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `support_access_approvals_administrator_fk` FOREIGN KEY (`platformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `security_events` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int,
  `actorType` enum('anonymous','tenant_user','platform_admin','support','system_job') NOT NULL,
  `userId` int,
  `platformAdministratorId` int,
  `supportAccessGrantId` int,
  `eventType` varchar(120) NOT NULL,
  `severity` enum('info','warning','high','critical') NOT NULL DEFAULT 'info',
  `outcome` enum('success','denied','error') NOT NULL,
  `requestId` varchar(64),
  `ipAddress` varchar(45),
  `userAgent` varchar(500),
  `metadata` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `security_events_publicId_unique` (`publicId`),
  KEY `security_events_company_time_idx` (`companyId`,`createdAt`,`id`),
  KEY `security_events_severity_time_idx` (`severity`,`createdAt`,`id`),
  KEY `security_events_request_idx` (`requestId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_files` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int NOT NULL,
  `farmId` int,
  `storageKey` varchar(500) NOT NULL,
  `originalName` varchar(255) NOT NULL,
  `contentType` varchar(100) NOT NULL,
  `sizeBytes` bigint NOT NULL,
  `checksumSha256` varchar(64) NOT NULL,
  `status` enum('reserved','uploading','quarantine','clean','rejected','deleted') NOT NULL DEFAULT 'reserved',
  `uploadedByMembershipId` int NOT NULL,
  `scanResult` json,
  `verifiedAt` timestamp NULL,
  `deletedAt` timestamp NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_files_publicId_unique` (`publicId`),
  UNIQUE KEY `tenant_files_storageKey_unique` (`storageKey`),
  UNIQUE KEY `tenant_files_company_id_id_unique` (`companyId`,`id`),
  KEY `tenant_files_company_status_idx` (`companyId`,`status`,`createdAt`),
  CONSTRAINT `tenant_files_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `tenant_files_uploader_fk` FOREIGN KEY (`companyId`,`uploadedByMembershipId`) REFERENCES `company_memberships` (`companyId`,`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `outbox_events` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `eventType` varchar(120) NOT NULL,
  `payload` json,
  `encryptedPayload` text,
  `encryptionKeyVersion` varchar(50),
  `status` enum('pending','processing','sent','failed','dead_letter') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `maxAttempts` int NOT NULL DEFAULT 5,
  `nextAttemptAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lockedBy` varchar(100),
  `lockedUntil` timestamp NULL,
  `deduplicationKey` varchar(200),
  `deduplicationCompanyId` int GENERATED ALWAYS AS (COALESCE(`companyId`, 0)) STORED,
  `lastError` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `outbox_events_deduplication_unique` (`deduplicationCompanyId`,`eventType`,`deduplicationKey`),
  KEY `outbox_events_claim_idx` (`status`,`nextAttemptAt`,`lockedUntil`,`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `background_jobs` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int,
  `jobType` varchar(120) NOT NULL,
  `payload` json NOT NULL,
  `status` enum('pending','processing','completed','failed','dead_letter','canceled') NOT NULL DEFAULT 'pending',
  `priority` int NOT NULL DEFAULT 0,
  `attempts` int NOT NULL DEFAULT 0,
  `maxAttempts` int NOT NULL DEFAULT 5,
  `runAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lockedBy` varchar(100),
  `lockedUntil` timestamp NULL,
  `deduplicationKey` varchar(200),
  `deduplicationCompanyId` int GENERATED ALWAYS AS (COALESCE(`companyId`, 0)) STORED,
  `lastError` text,
  `requestId` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `background_jobs_publicId_unique` (`publicId`),
  UNIQUE KEY `background_jobs_deduplication_unique` (`deduplicationCompanyId`,`jobType`,`deduplicationKey`),
  KEY `background_jobs_claim_idx` (`status`,`runAt`,`priority`,`lockedUntil`,`id`),
  KEY `background_jobs_company_history_idx` (`companyId`,`createdAt`,`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `companyId` int,
  `scopeCompanyId` int GENERATED ALWAYS AS (COALESCE(`companyId`, 0)) STORED,
  `userId` int NOT NULL,
  `keyHash` varchar(128) NOT NULL,
  `requestMethod` varchar(10) NOT NULL,
  `requestPathHash` varchar(128) NOT NULL,
  `requestBodyHash` varchar(128) NOT NULL,
  `responseStatus` int,
  `responseBody` json,
  `status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
  `lockedUntil` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` timestamp NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idempotency_keys_scope_unique` (`scopeCompanyId`,`userId`,`requestMethod`,`requestPathHash`,`keyHash`),
  KEY `idempotency_keys_expiry_idx` (`expiresAt`),
  CONSTRAINT `idempotency_keys_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `idempotency_keys_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `export_jobs` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int NOT NULL,
  `farmId` int,
  `requestedByMembershipId` int,
  `requestedByPlatformAdministratorId` int,
  `supportAccessGrantId` int,
  `exportType` varchar(80) NOT NULL,
  `filters` json,
  `status` enum('pending','processing','completed','failed','expired','canceled') NOT NULL DEFAULT 'pending',
  `tenantFileId` int,
  `failureReason` text,
  `expiresAt` timestamp NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `export_jobs_publicId_unique` (`publicId`),
  UNIQUE KEY `export_jobs_company_id_id_unique` (`companyId`,`id`),
  KEY `export_jobs_company_status_idx` (`companyId`,`status`,`createdAt`),
  CONSTRAINT `export_jobs_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `deletion_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int NOT NULL,
  `requestedByMembershipId` int,
  `requestedByPlatformAdministratorId` int,
  `approvedByPlatformAdministratorId` int,
  `reason` text NOT NULL,
  `status` enum('requested','exported','legal_hold','approved','purging','completed','canceled') NOT NULL DEFAULT 'requested',
  `retentionUntil` timestamp NOT NULL,
  `approvedAt` timestamp NULL,
  `purgedAt` timestamp NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `deletion_requests_publicId_unique` (`publicId`),
  KEY `deletion_requests_company_status_idx` (`companyId`,`status`,`createdAt`),
  CONSTRAINT `deletion_requests_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_restore_jobs` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `publicId` varchar(26) NOT NULL,
  `companyId` int NOT NULL,
  `sourceTenantFileId` int NOT NULL,
  `preRestoreExportJobId` bigint,
  `requestedByPlatformAdministratorId` int NOT NULL,
  `approvedByPlatformAdministratorId` int,
  `status` enum('pending','validating','ready','restoring','completed','failed','rolled_back','canceled') NOT NULL DEFAULT 'pending',
  `validationResult` json,
  `failureReason` text,
  `maintenanceLeaseUntil` timestamp NULL,
  `version` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_restore_jobs_publicId_unique` (`publicId`),
  KEY `tenant_restore_jobs_company_status_idx` (`companyId`,`status`,`createdAt`),
  CONSTRAINT `tenant_restore_jobs_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE RESTRICT
);
