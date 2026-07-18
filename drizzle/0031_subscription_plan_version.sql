ALTER TABLE `subscription_plans`
  ADD COLUMN `version` int NOT NULL DEFAULT 1 AFTER `currency`;
