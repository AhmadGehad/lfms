-- Email-bound acceptance cannot safely accept old subject-bound invitations.
-- Retain them for audit, revoke their access path, and require a fresh invite.
UPDATE `saas_company_invitations`
   SET `status` = 'revoked',
       `revokedAt` = COALESCE(`revokedAt`, CURRENT_TIMESTAMP),
       `version` = `version` + 1
 WHERE `status` = 'pending'
   AND `providerSubjectHash` <> UNHEX(SHA2(CONCAT(LOWER(TRIM(`provider`)), CHAR(0), 'email:', `normalizedEmail`), 256));
