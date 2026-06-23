-- Migration: backfill the weight log with each existing animal's acquisition
-- weight, so historical animals show their starting weight in weight history.
-- Skips animals that already have a weight entry on their acquisition date.

INSERT INTO `weight_log` (`animalId`, `weighDate`, `weightKg`, `notes`, `createdAt`)
SELECT a.`id`, a.`acquisitionDate`, a.`weightAtAcquisition`, 'Acquisition weight', now()
FROM `animals` a
WHERE a.`weightAtAcquisition` IS NOT NULL
  AND a.`weightAtAcquisition` > 0
  AND a.`deletedAt` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `weight_log` w
    WHERE w.`animalId` = a.`id`
      AND w.`weighDate` = a.`acquisitionDate`
      AND w.`deletedAt` IS NULL
  );
