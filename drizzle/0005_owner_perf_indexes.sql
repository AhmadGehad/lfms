-- Migration: performance indexes for owner-scoped queries and sales lookups
-- (A6 from the project review).

-- Owner-scoped animal filtering (Animals page filter, expense owner scoping)
ALTER TABLE `animals` ADD INDEX `idx_animals_ownerId` (`ownerId`);
--> statement-breakpoint
-- Sales joined/filtered by animal constantly (per-animal P&L, duplicate-sale checks)
ALTER TABLE `sales` ADD INDEX `idx_sales_animalId` (`animalId`);
--> statement-breakpoint
-- Expense owner scoping subqueries hit these
ALTER TABLE `expenses` ADD INDEX `idx_expenses_headId` (`headId`);
--> statement-breakpoint
ALTER TABLE `expenses` ADD INDEX `idx_expenses_categoryTarget` (`categoryTarget`);
