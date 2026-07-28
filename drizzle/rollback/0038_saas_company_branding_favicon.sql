ALTER TABLE `saas_company_branding`
  DROP FOREIGN KEY `company_branding_favicon_file_fk`;

ALTER TABLE `saas_company_branding`
  DROP KEY `company_branding_favicon_file_idx`;

ALTER TABLE `saas_company_branding`
  DROP COLUMN `faviconTenantFileId`;
