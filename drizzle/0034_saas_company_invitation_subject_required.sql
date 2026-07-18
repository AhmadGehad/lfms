-- TiDB does not retain CHECK constraints. Enforce the critical pending
-- invitation binding with a non-null SaaS-only column instead.
UPDATE `saas_company_invitations`
   SET `providerSubjectHash` = UNHEX(SHA2(CONCAT('revoked:', `id`), 256))
 WHERE `providerSubjectHash` IS NULL;
--> statement-breakpoint
ALTER TABLE `saas_company_invitations`
  MODIFY COLUMN `providerSubjectHash` binary(32) NOT NULL;
