ALTER TABLE `company_invitations`
  MODIFY COLUMN `invitedByMembershipId` int NULL,
  ADD COLUMN `farmPublicIds` json NULL AFTER `farmAccessMode`,
  ADD COLUMN `provider` varchar(50) NOT NULL DEFAULT 'manus' AFTER `farmPublicIds`,
  ADD COLUMN `providerSubjectHash` binary(32) NULL AFTER `provider`,
  ADD COLUMN `invitedByPlatformAdministratorId` int NULL AFTER `invitedByMembershipId`,
  ADD COLUMN `version` int NOT NULL DEFAULT 1 AFTER `revokedAt`,
  ADD COLUMN `activeSubjectKey` varchar(64) GENERATED ALWAYS AS (CASE WHEN `status` = 'pending' AND `providerSubjectHash` IS NOT NULL THEN HEX(`providerSubjectHash`) ELSE NULL END) STORED,
  ADD UNIQUE KEY `company_invitations_active_subject_unique` (`companyId`,`provider`,`activeSubjectKey`),
  ADD CONSTRAINT `company_invitations_platform_inviter_fk` FOREIGN KEY (`invitedByPlatformAdministratorId`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT;
--> statement-breakpoint
UPDATE `company_invitations`
   SET `status` = 'revoked',
       `revokedAt` = COALESCE(`revokedAt`, CURRENT_TIMESTAMP),
       `version` = `version` + 1
 WHERE `status` = 'pending'
   AND `providerSubjectHash` IS NULL;
--> statement-breakpoint
ALTER TABLE `company_invitations`
  ADD CONSTRAINT `company_invitations_inviter_attribution_check`
    CHECK ((`invitedByMembershipId` IS NULL) <> (`invitedByPlatformAdministratorId` IS NULL)),
  ADD CONSTRAINT `company_invitations_pending_subject_check`
    CHECK (`status` <> 'pending' OR `providerSubjectHash` IS NOT NULL);
