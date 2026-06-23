-- Migration: pregnancy tracking — pregnancy_records table + species.gestationDays

ALTER TABLE `species` ADD COLUMN `gestationDays` int NOT NULL DEFAULT 150;
--> statement-breakpoint
CREATE TABLE `pregnancy_records` (
  `id` int AUTO_INCREMENT NOT NULL,
  `animalId` int NOT NULL,
  `sireId` int,
  `confirmationDate` date NOT NULL,
  `gestationDays` int NOT NULL,
  `expectedDueDate` date NOT NULL,
  `notifyBeforeDue` int NOT NULL DEFAULT 7,
  `checkupDate` date,
  `notifyBeforeCheckup` int NOT NULL DEFAULT 3,
  `status` enum('active','delivered','aborted','lost') NOT NULL DEFAULT 'active',
  `outcomeLambingLogId` int,
  `completedDate` date,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `createdBy` int,
  `deletedAt` timestamp,
  `deletedBy` int,
  CONSTRAINT `pregnancy_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Index the active-pregnancy lookups used by the dashboard, alerts and profile.
CREATE INDEX `pregnancy_records_animal_status_idx` ON `pregnancy_records` (`animalId`, `status`);
--> statement-breakpoint
CREATE INDEX `pregnancy_records_due_idx` ON `pregnancy_records` (`status`, `expectedDueDate`);
