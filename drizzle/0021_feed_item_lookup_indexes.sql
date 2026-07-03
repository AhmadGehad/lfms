-- Speed up config.getFeedItems / getAllFeedItems.
-- The endpoint filters active feed_items and reads the latest price per item.

CREATE INDEX IF NOT EXISTS `feed_items_deleted_name_idx`
ON `feed_items` (`deletedAt`, `name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feed_item_price_history_item_date_id_idx`
ON `feed_item_price_history` (`feedItemId`, `effectiveDate`, `id`);
