CREATE TABLE `saas_company_branding` (
  `companyId` int NOT NULL,
  `logoTenantFileId` int NULL,
  `version` int NOT NULL DEFAULT 1,
  `updatedByMembershipId` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`companyId`),
  KEY `company_branding_logo_file_idx` (`logoTenantFileId`),
  CONSTRAINT `company_branding_company_fk`
    FOREIGN KEY (`companyId`) REFERENCES `saas_companies` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `company_branding_logo_file_fk`
    FOREIGN KEY (`companyId`, `logoTenantFileId`) REFERENCES `saas_tenant_files` (`companyId`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `company_branding_updated_by_fk`
    FOREIGN KEY (`companyId`, `updatedByMembershipId`) REFERENCES `saas_company_memberships` (`companyId`, `id`) ON DELETE RESTRICT
);
