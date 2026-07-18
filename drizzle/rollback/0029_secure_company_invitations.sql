ALTER TABLE `company_invitations`
  DROP FOREIGN KEY `company_invitations_platform_inviter_fk`,
  DROP CONSTRAINT `company_invitations_inviter_attribution_check`,
  DROP CONSTRAINT `company_invitations_pending_subject_check`,
  DROP INDEX `company_invitations_active_subject_unique`,
  DROP COLUMN `activeSubjectKey`,
  DROP COLUMN `version`,
  DROP COLUMN `invitedByPlatformAdministratorId`,
  DROP COLUMN `providerSubjectHash`,
  DROP COLUMN `provider`,
  DROP COLUMN `farmPublicIds`,
  MODIFY COLUMN `invitedByMembershipId` int NOT NULL;
