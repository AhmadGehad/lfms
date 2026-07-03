-- Migration: per-user settings (design version, theme, density, saved views…)
-- Key/value so new prefs need no migration. companyId is nullable until SaaS.

CREATE TABLE `user_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int,
	`settingKey` varchar(100) NOT NULL,
	`settingValue` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_settings_user_key_unique` UNIQUE(`userId`,`settingKey`)
);
--> statement-breakpoint
CREATE INDEX `user_settings_user_idx` ON `user_settings` (`userId`);
