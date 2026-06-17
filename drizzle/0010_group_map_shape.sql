-- Migration: add image-relative map geometry to groups for farm photo zones.

ALTER TABLE `groups` ADD COLUMN `mapShape` json NULL;
