CREATE TABLE `saas_email_log` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `template` varchar(100) NOT NULL,
  `recipientEmail` varchar(254) NOT NULL,
  `companyId` int,
  `status` enum('sent','failed','skipped_unconfigured') NOT NULL,
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `saas_email_log_id` PRIMARY KEY(`id`)
);

CREATE INDEX `email_log_template_time_idx` ON `saas_email_log` (`template`, `createdAt`, `id`);
CREATE INDEX `email_log_recipient_time_idx` ON `saas_email_log` (`recipientEmail`, `createdAt`, `id`);

ALTER TABLE `saas_email_log`
  ADD CONSTRAINT `email_log_company_fk` FOREIGN KEY (`companyId`) REFERENCES `saas_companies`(`id`) ON DELETE SET NULL;
