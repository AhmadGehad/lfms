-- Preserve birth records as the source of truth while keeping promotedHeadId
-- as the single stored birth-to-animal relationship.
-- This intentionally fails before any backfill if historical data linked
-- multiple birth records to one animal.
CREATE UNIQUE INDEX `lambing_log_promoted_head_unique`
  ON `lambing_log` (`promotedHeadId`);

ALTER TABLE `animal_categories`
  ADD COLUMN `lambIdSequence` int NOT NULL DEFAULT 0;

UPDATE `animal_categories` c
SET c.`lambIdSequence` = LEAST(
  2147483646,
  COALESCE((
    SELECT MAX(
      CAST(SUBSTRING(l.`lambId`, CHAR_LENGTH(c.`idPrefix`) + 1) AS UNSIGNED)
    )
    FROM `lambing_log` l
    WHERE l.`lambId` LIKE CONCAT(c.`idPrefix`, '%')
      AND SUBSTRING(l.`lambId`, CHAR_LENGTH(c.`idPrefix`) + 1)
        REGEXP '^[0-9]+$'
  ), 0)
);

ALTER TABLE `lambing_log`
  ADD COLUMN `speciesId` int NULL,
  ADD COLUMN `categoryId` int NULL,
  ADD COLUMN `promotedAnimalCode` varchar(20) NULL,
  ADD COLUMN `promotedAnimalPurgedAt` timestamp NULL;

-- Promoted animal data is the strongest legacy source. It also resolves old
-- dam/sire divergence in favor of the registered animal profile.
UPDATE `lambing_log` l
JOIN `animals` a ON a.`id` = l.`promotedHeadId`
SET
  l.`speciesId` = a.`speciesId`,
  l.`categoryId` = a.`categoryId`,
  l.`damId` = a.`damId`,
  l.`sireId` = a.`sireId`,
  l.`promotedAnimalCode` = a.`animalId`,
  l.`isPromoted` = true,
  l.`deletedAt` = NULL,
  l.`deletedBy` = NULL;

-- For unpromoted legacy births, infer classification from the dam first.
UPDATE `lambing_log` l
JOIN `animals` dam ON dam.`id` = l.`damId`
SET
  l.`speciesId` = COALESCE(l.`speciesId`, dam.`speciesId`),
  l.`categoryId` = COALESCE(l.`categoryId`, dam.`categoryId`)
WHERE l.`speciesId` IS NULL OR l.`categoryId` IS NULL;

-- Last-resort category inference uses the longest matching configured prefix.
UPDATE `lambing_log` l
SET l.`categoryId` = (
  SELECT CASE WHEN COUNT(*) = 1 THEN MIN(c.`id`) ELSE NULL END
  FROM `animal_categories` c
  WHERE l.`lambId` LIKE CONCAT(c.`idPrefix`, '%')
    AND CHAR_LENGTH(c.`idPrefix`) = (
      SELECT MAX(CHAR_LENGTH(c2.`idPrefix`))
      FROM `animal_categories` c2
      WHERE l.`lambId` LIKE CONCAT(c2.`idPrefix`, '%')
    )
)
WHERE l.`categoryId` IS NULL;

UPDATE `lambing_log` l
JOIN `animal_categories` c ON c.`id` = l.`categoryId`
SET l.`speciesId` = COALESCE(l.`speciesId`, c.`speciesId`)
WHERE l.`speciesId` IS NULL;

-- Repair historical dangling promotion links left by the old cascade rules.
-- The animal code is unavailable if the animal was already purged, but the
-- birth remains permanently marked as promoted history.
UPDATE `lambing_log` l
LEFT JOIN `animals` a ON a.`id` = l.`promotedHeadId`
SET
  l.`promotedHeadId` = NULL,
  l.`promotedAnimalPurgedAt` = COALESCE(l.`promotedAnimalPurgedAt`, CURRENT_TIMESTAMP),
  l.`deletedAt` = NULL,
  l.`deletedBy` = NULL
WHERE l.`isPromoted` = true
  AND l.`promotedHeadId` IS NOT NULL
  AND a.`id` IS NULL;

UPDATE `lambing_log`
SET
  `promotedAnimalPurgedAt` = CASE
    WHEN `promotedHeadId` IS NULL
      THEN COALESCE(`promotedAnimalPurgedAt`, CURRENT_TIMESTAMP)
    ELSE `promotedAnimalPurgedAt`
  END,
  `deletedAt` = NULL,
  `deletedBy` = NULL
WHERE `isPromoted` = true;
