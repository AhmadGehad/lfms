-- Migration: add "herd" (animal-wide) allocation type to expenses.targetType.
-- A herd expense is split equally across all animals active on the expense date.

ALTER TABLE `expenses`
  MODIFY COLUMN `targetType` enum('general','category','head','herd') NOT NULL;
