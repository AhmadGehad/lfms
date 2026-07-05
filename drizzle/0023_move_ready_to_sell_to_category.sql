-- Remove readyToSellThreshold from species table
ALTER TABLE `species` DROP COLUMN `readyToSellThreshold`;

-- Add readyToSellThreshold to animal_categories table
ALTER TABLE `animal_categories` ADD COLUMN `readyToSellThreshold` decimal(5,2) DEFAULT 80.00 NOT NULL COMMENT 'Percentage of target weight to mark animal as ready to sell (e.g., 80 = 80%)' AFTER `autoStageTargetCategoryId`;
