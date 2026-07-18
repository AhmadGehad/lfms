-- SaaS-only upgrade for the originally provisioned v1 invitation table.
-- Legacy tables are never referenced or altered.
ALTER TABLE `saas_company_invitations`
  MODIFY COLUMN `invitedByMembershipId` int NULL;
--> statement-breakpoint
ALTER TABLE `saas_company_invitations`
  ADD COLUMN IF NOT EXISTS `farmPublicIds` json NULL;
--> statement-breakpoint
ALTER TABLE `saas_company_invitations`
  ADD COLUMN IF NOT EXISTS `provider` varchar(50) NOT NULL DEFAULT 'manus';
--> statement-breakpoint
ALTER TABLE `saas_company_invitations`
  ADD COLUMN IF NOT EXISTS `providerSubjectHash` binary(32) NULL;
--> statement-breakpoint
ALTER TABLE `saas_company_invitations`
  ADD COLUMN IF NOT EXISTS `invitedByPlatformAdministratorId` int NULL;
--> statement-breakpoint
ALTER TABLE `saas_company_invitations`
  ADD COLUMN IF NOT EXISTS `version` int NOT NULL DEFAULT 1;
--> statement-breakpoint
-- A v1 pending invitation has no secure identity binding. Retain it for
-- support/audit, but revoke it rather than allowing a weaker acceptance flow.
UPDATE `saas_company_invitations`
   SET `status` = 'revoked',
       `revokedAt` = COALESCE(`revokedAt`, CURRENT_TIMESTAMP),
       `version` = `version` + 1
 WHERE `status` = 'pending'
   AND `providerSubjectHash` IS NULL;
--> statement-breakpoint
ALTER TABLE `saas_company_invitations`
  ADD CONSTRAINT `saas_company_invitations_platform_inviter_fk` FOREIGN KEY (`invitedByPlatformAdministratorId`) REFERENCES `saas_platform_administrators` (`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `saas_company_invitations`
  ADD CONSTRAINT `saas_company_invitations_inviter_attribution_check` CHECK ((`invitedByMembershipId` IS NULL) <> (`invitedByPlatformAdministratorId` IS NULL));
--> statement-breakpoint
ALTER TABLE `saas_company_invitations`
  ADD CONSTRAINT `saas_company_invitations_pending_subject_check` CHECK (`status` <> 'pending' OR `providerSubjectHash` IS NOT NULL);
