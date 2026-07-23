ALTER TABLE `saas_company_branding`
  ADD COLUMN `faviconTenantFileId` int NULL AFTER `logoTenantFileId`;

ALTER TABLE `saas_company_branding`
  ADD KEY `company_branding_favicon_file_idx` (`faviconTenantFileId`);

ALTER TABLE `saas_company_branding`
  ADD CONSTRAINT `company_branding_favicon_file_fk`
    FOREIGN KEY (`companyId`, `faviconTenantFileId`) REFERENCES `saas_tenant_files` (`companyId`, `id`) ON DELETE RESTRICT;
