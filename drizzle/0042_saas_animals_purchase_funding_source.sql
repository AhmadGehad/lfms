ALTER TABLE `saas_azal_animals`
  ADD COLUMN `purchaseFundingSource` enum('revenue','investment') NULL AFTER `purchaseCost`;
