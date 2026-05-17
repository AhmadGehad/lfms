ALTER TABLE `animal_categories`
  ADD COLUMN `autoStageWeightKg` DECIMAL(8,2) NULL,
  ADD COLUMN `autoStageTargetCategoryId` INT NULL;
