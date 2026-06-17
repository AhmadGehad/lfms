CREATE TABLE `owners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`phone` varchar(30),
	`email` varchar(100),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	`deletedAt` timestamp,
	`deletedBy` int,
	CONSTRAINT `owners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vaccination_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`animalId` int NOT NULL,
	`vaccineId` int NOT NULL,
	`vaccinationDate` date NOT NULL,
	`nextDueDate` date,
	`batchNumber` varchar(50),
	`notes` text,
	`veterinarian` varchar(100),
	`isCompleted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	`deletedAt` timestamp,
	`deletedBy` int,
	CONSTRAINT `vaccination_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vaccines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`validityPeriod` int NOT NULL,
	`validityUnit` enum('days','months') NOT NULL DEFAULT 'days',
	`boosterRequired` boolean NOT NULL DEFAULT false,
	`boosterInterval` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	`deletedAt` timestamp,
	`deletedBy` int,
	CONSTRAINT `vaccines_id` PRIMARY KEY(`id`),
	CONSTRAINT `vaccines_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `expenses` MODIFY COLUMN `targetType` enum('general','category','head','herd') NOT NULL;--> statement-breakpoint
ALTER TABLE `animal_categories` ADD `autoStageWeightKg` decimal(8,2);--> statement-breakpoint
ALTER TABLE `animal_categories` ADD `autoStageTargetCategoryId` int;--> statement-breakpoint
ALTER TABLE `animal_categories` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `animal_categories` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `animal_statuses` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `animal_statuses` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `animals` ADD `ownerId` int;--> statement-breakpoint
ALTER TABLE `animals` ADD `photoUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `animals` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `animals` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `birth_types` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `birth_types` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `expenses` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `expenses` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `feed_items` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `feed_items` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `feed_stock_ledger` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `feed_stock_ledger` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `groups` ADD `latitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `groups` ADD `longitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `groups` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `groups` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `lambing_log` ADD `valueUsed` decimal(10,2);--> statement-breakpoint
ALTER TABLE `lambing_log` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `lambing_log` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `ration_plans` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `ration_plans` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `sales` ADD `amountPaid` decimal(10,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `sales` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `species` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `species` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `weight_log` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `weight_log` ADD `deletedBy` int;