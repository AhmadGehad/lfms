-- Migration: add latitude and longitude to groups for map view

ALTER TABLE `groups` ADD COLUMN `latitude` decimal(10,7) NULL;
ALTER TABLE `groups` ADD COLUMN `longitude` decimal(10,7) NULL;