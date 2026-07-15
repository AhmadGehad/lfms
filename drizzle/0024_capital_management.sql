CREATE TABLE `capital_investors` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerId` int NOT NULL,
  `name` varchar(120) NOT NULL,
  `phone` varchar(30),
  `email` varchar(100),
  `notes` text,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `createdBy` int,
  `deletedAt` timestamp,
  `deletedBy` int,
  CONSTRAINT `capital_investors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `capital_investors_owner_active_idx` ON `capital_investors` (`ownerId`,`isActive`);
--> statement-breakpoint
CREATE TABLE `capital_funding_batches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerId` int NOT NULL,
  `kind` enum('pro_rata','reversal') NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `effectiveDate` date NOT NULL,
  `notes` text,
  `reversalOfBatchId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `createdBy` int NOT NULL,
  CONSTRAINT `capital_funding_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `capital_funding_batches_owner_date_idx` ON `capital_funding_batches` (`ownerId`,`effectiveDate`);
--> statement-breakpoint
CREATE UNIQUE INDEX `capital_funding_batches_reversal_unique` ON `capital_funding_batches` (`reversalOfBatchId`);
--> statement-breakpoint
CREATE TABLE `capital_contributions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerId` int NOT NULL,
  `investorId` int NOT NULL,
  `batchId` int,
  `kind` enum('initial','direct','pro_rata','reversal') NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `effectiveDate` date NOT NULL,
  `notes` text,
  `reversalOfContributionId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `createdBy` int NOT NULL,
  CONSTRAINT `capital_contributions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `capital_contributions_owner_date_idx` ON `capital_contributions` (`ownerId`,`effectiveDate`);
--> statement-breakpoint
CREATE INDEX `capital_contributions_investor_date_idx` ON `capital_contributions` (`investorId`,`effectiveDate`);
--> statement-breakpoint
CREATE UNIQUE INDEX `capital_contributions_reversal_unique` ON `capital_contributions` (`reversalOfContributionId`);
--> statement-breakpoint
CREATE TABLE `capital_profit_allocations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerId` int NOT NULL,
  `kind` enum('monthly','adjustment') NOT NULL,
  `status` enum('draft','finalized') NOT NULL DEFAULT 'draft',
  `periodStart` date NOT NULL,
  `periodEnd` date NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `adjustmentOfAllocationId` int,
  `notes` text,
  `finalizedAt` timestamp,
  `finalizedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `createdBy` int NOT NULL,
  CONSTRAINT `capital_profit_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `capital_profit_allocations_owner_period_idx` ON `capital_profit_allocations` (`ownerId`,`periodStart`,`periodEnd`);
--> statement-breakpoint
CREATE UNIQUE INDEX `capital_profit_allocations_owner_kind_period_unique` ON `capital_profit_allocations` (`ownerId`,`kind`,`periodStart`,`periodEnd`);
--> statement-breakpoint
CREATE TABLE `capital_profit_allocation_lines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `allocationId` int NOT NULL,
  `investorId` int NOT NULL,
  `ownershipPct` decimal(9,6) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `capital_profit_allocation_lines_id` PRIMARY KEY(`id`),
  CONSTRAINT `capital_profit_lines_allocation_investor_unique` UNIQUE(`allocationId`,`investorId`)
);
