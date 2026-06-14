-- Migration: add valueUsed to lambing_log for birth record financial value

ALTER TABLE `lambing_log` ADD COLUMN `valueUsed` decimal(10,2) NULL;