-- Seed quota limit features into the SaaS feature catalog. Additive only:
-- touches saas_feature_catalog exclusively; no legacy LFMS table is changed.
-- getEffectiveLimit fails closed to 0 when one of these catalog rows is
-- missing, so every environment needs them before plans can grant quotas.
INSERT INTO `saas_feature_catalog`
  (`publicId`, `code`, `name`, `description`, `status`, `disabledDataMode`, `limitUnit`)
VALUES
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:users_limit', 256)), 1, 23)), 'users_limit', 'Users Limit', 'Maximum active company members', 'active', 'read_only', 'count'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:farms_limit', 256)), 1, 23)), 'farms_limit', 'Farms Limit', 'Maximum active farms', 'active', 'read_only', 'count'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:animals_limit', 256)), 1, 23)), 'animals_limit', 'Animals Limit', 'Maximum active animals', 'active', 'read_only', 'count'),
  (CONCAT('01J', SUBSTRING(UPPER(SHA2('feature:storage_limit', 256)), 1, 23)), 'storage_limit', 'Storage Limit', 'Maximum stored file bytes', 'active', 'read_only', 'bytes')
ON DUPLICATE KEY UPDATE `code` = `code`;
