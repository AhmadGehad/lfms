CREATE TABLE `animal_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`speciesId` int NOT NULL,
	`idPrefix` varchar(10) NOT NULL,
	`idSequence` int NOT NULL DEFAULT 0,
	`targetWeightKg` decimal(8,2),
	`expectedCycleDays` int,
	`isExitStatus` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `animal_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `animal_status_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`animalId` int NOT NULL,
	`previousStatusId` int,
	`newStatusId` int NOT NULL,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	`changedBy` int,
	`notes` text,
	CONSTRAINT `animal_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `animal_statuses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`isExitStatus` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `animal_statuses_id` PRIMARY KEY(`id`),
	CONSTRAINT `animal_statuses_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `animals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`animalId` varchar(20) NOT NULL,
	`speciesId` int NOT NULL,
	`categoryId` int NOT NULL,
	`groupId` int NOT NULL,
	`statusId` int NOT NULL,
	`sex` enum('male','female') NOT NULL,
	`acquisitionType` enum('purchased','born') NOT NULL,
	`acquisitionDate` date NOT NULL,
	`birthDate` date NOT NULL,
	`damId` int,
	`sireId` int,
	`purchaseCost` decimal(10,2) DEFAULT '0',
	`weightAtAcquisition` decimal(8,2),
	`exitDate` date,
	`exitReason` text,
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `animals_id` PRIMARY KEY(`id`),
	CONSTRAINT `animals_animalId_unique` UNIQUE(`animalId`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(50) NOT NULL,
	`entityType` varchar(50) NOT NULL,
	`entityId` varchar(50),
	`oldValues` json,
	`newValues` json,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `birth_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `birth_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `birth_types_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `expense_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `expense_categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `expense_sub_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `expense_sub_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`expenseDate` date NOT NULL,
	`categoryId` int NOT NULL,
	`subCategoryId` int,
	`amount` decimal(10,2) NOT NULL,
	`targetType` enum('general','category','head') NOT NULL,
	`categoryTarget` int,
	`headId` int,
	`vendorName` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feed_item_price_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`feedItemId` int NOT NULL,
	`effectiveDate` date NOT NULL,
	`pricePerUnit` decimal(10,2) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `feed_item_price_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feed_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'kg',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `feed_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `feed_items_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `feed_stock_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`feedItemId` int NOT NULL,
	`transactionDate` date NOT NULL,
	`transactionType` enum('purchase','stock_count','adjustment') NOT NULL,
	`qty` decimal(10,3) NOT NULL,
	`unitCost` decimal(10,2),
	`totalCost` decimal(10,2),
	`supplierName` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `feed_stock_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupCode` varchar(20) NOT NULL,
	`name` varchar(100) NOT NULL,
	`speciesId` int,
	`categoryId` int,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `groups_groupCode_unique` UNIQUE(`groupCode`)
);
--> statement-breakpoint
CREATE TABLE `lambing_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lambId` varchar(20) NOT NULL,
	`birthDate` date NOT NULL,
	`damId` int,
	`sireId` int,
	`sex` enum('male','female') NOT NULL,
	`birthTypeId` int NOT NULL,
	`birthWeightKg` decimal(8,2),
	`groupId` int,
	`notes` text,
	`isPromoted` boolean NOT NULL DEFAULT false,
	`promotedHeadId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `lambing_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `lambing_log_lambId_unique` UNIQUE(`lambId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`alertType` varchar(50) NOT NULL,
	`title` varchar(200) NOT NULL,
	`message` text NOT NULL,
	`relatedEntityType` varchar(50),
	`relatedEntityId` varchar(50),
	`isRead` boolean NOT NULL DEFAULT false,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ration_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`feedItemId` int NOT NULL,
	`qtyPerHeadPerDay` decimal(8,3) NOT NULL,
	`effectiveDate` date NOT NULL,
	`endDate` date,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `ration_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`animalId` int NOT NULL,
	`saleDate` date NOT NULL,
	`salePrice` decimal(10,2) NOT NULL,
	`weightAtSale` decimal(8,2),
	`pricePerKg` decimal(10,2),
	`buyerName` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `sales_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `species` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `species_id` PRIMARY KEY(`id`),
	CONSTRAINT `species_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(100) NOT NULL,
	`settingValue` text NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedBy` int,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `weight_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`animalId` int NOT NULL,
	`weighDate` date NOT NULL,
	`weightKg` decimal(8,2) NOT NULL,
	`sessionId` varchar(36),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `weight_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('owner','supervisor','staff','admin','user') NOT NULL DEFAULT 'user';