-- Remove the narrowly scoped grants before removing their permission records.
-- Role and administrator records remain intact, so rolling the application
-- back does not delete workforce identities or mutate unrelated authority.
DELETE prp
FROM `platform_role_permissions` prp
JOIN `platform_permissions` p ON p.`id` = prp.`platformPermissionId`
WHERE p.`code` IN ('administrators.read','administrators.write');
--> statement-breakpoint
DELETE FROM `platform_permissions`
WHERE `code` IN ('administrators.read','administrators.write');
