-- Add per-record notify-before lead times (in days) for next-due and booster vaccinations.
ALTER TABLE `vaccination_records` ADD COLUMN `notifyBeforeNext` int DEFAULT 7;
ALTER TABLE `vaccination_records` ADD COLUMN `notifyBeforeBooster` int DEFAULT 7;
