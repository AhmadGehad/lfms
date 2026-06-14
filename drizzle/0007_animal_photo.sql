-- Migration: add photoUrl to animals (stores the storage key for the animal's photo).

ALTER TABLE `animals` ADD COLUMN `photoUrl` varchar(500) NULL;
