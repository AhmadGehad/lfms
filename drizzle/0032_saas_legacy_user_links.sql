-- Additive sidecar provenance only. Do not reference or alter a legacy table.
CREATE TABLE IF NOT EXISTS `saas_legacy_user_links` (
  `companyId` int NOT NULL,
  `legacyUserId` int NOT NULL,
  `saasUserId` int NOT NULL,
  `legacyOpenId` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`companyId`, `legacyUserId`),
  UNIQUE KEY `saas_legacy_user_links_company_user_unique` (`companyId`, `saasUserId`),
  CONSTRAINT `saas_legacy_user_links_company_fk` FOREIGN KEY (`companyId`) REFERENCES `saas_companies` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `saas_legacy_user_links_user_fk` FOREIGN KEY (`saasUserId`) REFERENCES `saas_users` (`id`) ON DELETE RESTRICT
);
