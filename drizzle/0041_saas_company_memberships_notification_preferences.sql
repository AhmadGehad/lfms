ALTER TABLE `saas_company_memberships`
  ADD COLUMN `notificationPreferences` json NULL AFTER `ownerCompanyGuard`;
