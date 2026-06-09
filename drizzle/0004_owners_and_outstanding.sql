-- Migration: owners table + animals.ownerId + sales.amountPaid (for outstanding fees)

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
ALTER TABLE `animals` ADD COLUMN `ownerId` int NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD COLUMN `amountPaid` decimal(10,2) NOT NULL DEFAULT '0';
--> statement-breakpoint
-- Back-fill: assume existing sales are fully paid (amountPaid = salePrice)
UPDATE `sales` SET `amountPaid` = `salePrice` WHERE `amountPaid` = 0;
