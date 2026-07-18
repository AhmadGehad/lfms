-- Add narrowly scoped platform-administrator authority for upgraded installs.
-- The fresh-install seed in 0026 contains the same permissions. No support or
-- operations role receives these grants: an existing platform administrator
-- must explicitly hold the system platform_admin role to manage peer access.
INSERT INTO `platform_permissions` (`code`,`description`)
VALUES
  ('administrators.read', 'View platform administrators and roles'),
  ('administrators.write', 'Manage platform administrator status and roles')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
--> statement-breakpoint
INSERT INTO `platform_role_permissions` (`platformRoleId`,`platformPermissionId`)
SELECT r.`id`, p.`id`
FROM `platform_roles` r
JOIN `platform_permissions` p ON p.`code` IN ('administrators.read','administrators.write')
WHERE r.`code` = 'platform_admin'
ON DUPLICATE KEY UPDATE `platformPermissionId` = VALUES(`platformPermissionId`);
