-- Add indexes for feed stock status queries (getFeedStockStatus)
-- These columns are heavily filtered on but had no indexes, causing full table scans.

-- feed_stock_ledger: filtered by feedItemId + transactionType + deletedAt in every stock query
CREATE INDEX IF NOT EXISTS idx_feed_stock_ledger_item_type ON feed_stock_ledger (feedItemId, transactionType, deletedAt);
CREATE INDEX IF NOT EXISTS idx_feed_stock_ledger_item_date ON feed_stock_ledger (feedItemId, transactionDate);

-- ration_plans: filtered by feedItemId + isActive + deletedAt
CREATE INDEX IF NOT EXISTS idx_ration_plans_item_active ON ration_plans (feedItemId, isActive, deletedAt);

-- feed_item_price_history: filtered by feedItemId, ordered by effectiveDate
CREATE INDEX IF NOT EXISTS idx_feed_item_price_history_item_date ON feed_item_price_history (feedItemId, effectiveDate);
