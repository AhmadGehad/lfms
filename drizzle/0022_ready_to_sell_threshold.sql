ALTER TABLE `species` ADD COLUMN `readyToSellThreshold` decimal(5,2) DEFAULT 80.00 NOT NULL COMMENT 'Percentage of target weight to mark animal as ready to sell (e.g., 80 = 80%)';
