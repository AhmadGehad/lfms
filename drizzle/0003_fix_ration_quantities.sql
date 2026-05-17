-- Fix ration plan quantities to match Excel reference (Feed_Log sheet)
-- Correct values: Ewe Alfalfa Hay=0.500, Ewe Hay=0.300, Fattening Alfalfa Hay=0.500
--                 Fattening Concentrate 16%=1.250, Ram Alfalfa Hay=0.500

-- Ewe + Alfalfa Hay: 0.75 → 0.500
UPDATE ration_plans rp
  JOIN animal_categories ac ON rp.categoryId = ac.id
  JOIN feed_items fi ON rp.feedItemId = fi.id
  SET rp.qtyPerHeadPerDay = '0.500'
WHERE ac.name = 'Ewe' AND fi.name = 'Alfalfa Hay' AND rp.deletedAt IS NULL;

-- Ewe + Hay: 0.50 → 0.300
UPDATE ration_plans rp
  JOIN animal_categories ac ON rp.categoryId = ac.id
  JOIN feed_items fi ON rp.feedItemId = fi.id
  SET rp.qtyPerHeadPerDay = '0.300'
WHERE ac.name = 'Ewe' AND fi.name = 'Hay' AND rp.deletedAt IS NULL;

-- Fattening + Alfalfa Hay: 0.75 → 0.500
UPDATE ration_plans rp
  JOIN animal_categories ac ON rp.categoryId = ac.id
  JOIN feed_items fi ON rp.feedItemId = fi.id
  SET rp.qtyPerHeadPerDay = '0.500'
WHERE ac.name = 'Fattening' AND fi.name = 'Alfalfa Hay' AND rp.deletedAt IS NULL;

-- Fattening + Concentrate 16%: 1.00 → 1.250
UPDATE ration_plans rp
  JOIN animal_categories ac ON rp.categoryId = ac.id
  JOIN feed_items fi ON rp.feedItemId = fi.id
  SET rp.qtyPerHeadPerDay = '1.250'
WHERE ac.name = 'Fattening' AND fi.name = 'Concentrate 16%' AND rp.deletedAt IS NULL;

-- Ram + Alfalfa Hay: 0.75 → 0.500
UPDATE ration_plans rp
  JOIN animal_categories ac ON rp.categoryId = ac.id
  JOIN feed_items fi ON rp.feedItemId = fi.id
  SET rp.qtyPerHeadPerDay = '0.500'
WHERE ac.name = 'Ram' AND fi.name = 'Alfalfa Hay' AND rp.deletedAt IS NULL;
