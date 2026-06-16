# LFMS Project TODO

## Phase 1: Database Schema & Migrations
- [x] Design and write full Drizzle schema (21 tables)
- [x] Run migration and apply to database
- [x] Seed reference data (species, categories, statuses, feed items, expense categories, settings)

## Phase 2: Backend Routers
- [x] Configuration router (species, categories, groups, statuses, birth types, feed items, expense categories, settings)
- [x] Animal Registry router (CRUD, lifecycle transitions, auto-ID generation)
- [x] Animal Profile router (financial card, lineage tree, weight/feed/expense/status history)
- [x] Breeding & Lambing router (record birth, promote to registry)
- [x] Fattening Tracker router (weigh-in sessions, weight log via animals.addWeight)
- [x] Feed Management router (ration plans, feed stock, purchases, stock counts)
- [x] Expense Log router (add/edit/delete expenses with GENERAL/CATEGORY/HEAD attribution)
- [x] Dashboard router (KPI cards, category table, charts, feed stock status)
- [x] Animal P&L router (lifetime cost breakdown, sale records)
- [x] Income Statement router (farm-level P&L)
- [x] Notifications router (alerts, in-app notification center)
- [x] User Management router (roles, audit log)
- [x] Sales router (structured sale records)

## Phase 3: Frontend - Core Layout & Configuration
- [x] Design system: earthy green farm theme, typography, global CSS
- [x] DashboardLayout with sidebar navigation (all 14 modules)
- [x] Configuration Hub page (tabbed interface)
  - [x] Species management
  - [x] Animal Categories management
  - [x] Groups/Pens management
  - [x] Animal Statuses management
  - [x] Birth Types management
  - [x] Feed Items & Price History management
  - [x] Expense Categories & Sub-categories management
  - [x] System Settings

## Phase 4: Frontend - Animal Registry & Profile
- [x] Animal Registry list page (filterable table)
- [x] Add Animal form (dropdown-only, auto-ID)
- [x] Animal Profile screen
  - [x] Identity & Status bar
  - [x] Financial Summary Card (P&L)
  - [x] Lineage Tree visualization
  - [x] Weight History tab (line chart)
  - [x] Feed History tab (table)
  - [x] Expense History tab (table)
  - [x] Status History / Audit tab
  - [x] Sale Record tab

## Phase 5: Frontend - Operational Modules
- [x] Breeding & Lambing page (log births, promote to registry)
- [x] Fattening Tracker page (weigh-in sessions, growth charts)
- [x] Feed Management page (ration plans, stock ledger)
- [x] Expense Log page (add/edit expenses, attribution)

## Phase 6: Frontend - Dashboard & Reports
- [x] Dashboard page
  - [x] Filter bar (date range, species, category, group, status, view mode)
  - [x] KPI cards (cost, revenue, P&L)
  - [x] Category breakdown table
  - [x] Expense breakdown chart (Recharts bar chart)
  - [x] Head count chart (Recharts bar chart)
  - [x] P&L timeline chart (Recharts line chart)
  - [x] Feed Stock status table (always unfiltered)
- [x] Income Statement page (filterable)
- [x] Notifications center (in-app alerts)
- [x] Sales page (sale records)
- [x] Audit Log page
- [x] User Management page
- [x] P&L page (per-animal profitability)

## Phase 7: Unit Tests
- [x] Configuration module tests (species, categories, groups, feed items, expense categories, settings)
- [x] Animal Registry tests (list, getById, create, weight log, P&L, status history)
- [x] Dashboard tests (KPIs, feed stock status, income statement, trends, head count)
- [x] Notifications tests (list, create, markRead, markAllRead)
- [x] Audit log tests
- [x] Sales tests
- [x] Business logic assertions (P&L math, feed stock alerts, income statement)
- [x] Auth tests (me, logout)
- [x] Total: 48 tests, all passing

## Phase 8: API Flow Testing Script
- [x] Full end-to-end API test script (Node.js) at scripts/test-api-flow.mjs
- [x] Tests all major workflows (19 tests, all passing)
- [x] Validates authentication enforcement (all protected routes return 401 without session)
- [x] Validates public routes (server health, auth.me)

## Phase 9: Deployment
- [x] TypeScript: 0 errors
- [x] Save checkpoint
- [x] Deploy on Manus server

## Phase 10: Excel Import & Export + Rename + i18n
- [x] Fix SQL schema mismatches (targetType field name, etc.)
- [x] Execute full Excel data import (132 animals, weight logs, expenses, ration plans, feed stock)
- [x] Verify import counts in database
- [x] Rename app to "Azal Farms - مزارع أزَل" (title, branding, logo, favicon)
- [x] Add Arabic/English i18n system (react-i18next) with language switcher
- [x] Translate all UI labels, navigation, page headings to Arabic
- [x] Support RTL layout when Arabic is selected
- [x] Add PDF export to Income Statement page (jsPDF + jspdf-autotable)
- [x] Add Excel export to Income Statement page (xlsx)

## Phase 12: Soft-Delete with Restore
- [x] Add deletedAt + deletedBy columns to all 14 entity tables via migration
- [x] Update all list queries to exclude soft-deleted records by default
- [x] Add softDelete and restore procedures for all entities (recycleBin router)
- [x] Cascade soft-delete: deleting an animal also soft-deletes related records
- [x] Add Recycle Bin page showing all soft-deleted records grouped by type
- [x] Add delete button (with confirmation dialog) to Animals, Expenses, Feed, Breeding, Sales pages
- [x] Add restore button in Recycle Bin with cascade restore
- [x] Add permanent delete option in Recycle Bin (admin only)
- [x] Wire Recycle Bin route in App.tsx and navigation
- [x] Add Recycle Bin to sidebar navigation with Trash2 icon
- [x] Add recycleBin i18n keys (English + Arabic)
- [x] Final TypeScript check (0 errors)
- [x] All 48 unit tests pass
- [x] Save checkpoint and deploy

## Bug Fixes (Phase 16)
- [x] Fix Arabic translation: added useTranslation() + t() calls to all 14 page components
- [x] Fix Dashboard "Unknown" category labels: d.categoryName → d.category (field name mismatch)
- [x] Verified: database join works correctly (128 active animals with correct category names)
- [x] Fix Recycle Bin crash: empty string SelectItem value="" → value="all"
- [x] TypeScript: 0 errors
- [x] All 48 unit tests pass
- [x] Save checkpoint and deploy

## Bug Fixes (Phase 17)
- [x] Fix Dashboard expense trend chart: d.period/d.totalAmount → d.month/d.total
- [x] Fix Dashboard sales trend chart: d.saleDate/d.totalRevenue → d.month/d.revenue
- [x] TypeScript: 0 errors
- [x] All 48 unit tests pass
- [x] Save checkpoint and deploy

## Bug Fixes (Phase 18)
- [x] Fix RTL layout: sidebar must move to right side when Arabic is selected (DashboardLayout rewritten with side={isAr ? 'right' : 'left'})
- [x] Fix RTL: content area must not overflow/clip off-screen in Arabic mode
- [x] Fix Dashboard chart legends: compact donut with percentage labels + truncated legend text (max 12 chars)
- [x] Fix expenses showing 0: getDashboardKPIs default date range changed from current-month to last 12 months; Dashboard.tsx trend charts also updated to 12-month window
- [x] Add missing nav.groups and auth i18n keys to both EN and AR translations
- [x] TypeScript: 0 errors
- [x] All 48 unit tests pass
- [x] Save checkpoint and deploy

## Feature: Configuration Edit/Update (Phase 19)
- [x] Add updateSpecies procedure (name, description)
- [x] Add updateCategory procedure (name, prefix, targetWeight, speciesId)
- [x] Add updateGroup procedure (name, description)
- [x] Add updateBirthType procedure (name, description) — db.ts
- [x] Add updateFeedItem procedure (name, unit) — already existed
- [x] Add updateExpenseCategory procedure (name, description)
- [x] Add updateExpenseSubCategory procedure (name)
- [x] Add edit button + inline edit dialog to Species tab in Configuration Hub
- [x] Add edit button + inline edit dialog to Categories tab
- [x] Add edit button + inline edit dialog to Groups tab
- [x] Add edit button + inline edit dialog to Feed Items tab
- [x] Add edit button + inline edit dialog to Expense Categories tab
- [x] TypeScript: 0 errors
- [x] All 48 unit tests pass
- [x] Save checkpoint and deploy

## Feature: Edit Sale Price (Phase 20)
- [x] Add updateSale procedure to db.ts (salePrice, weightAtSale, saleDate, notes)
- [x] Wire updateSale in sales router
- [x] Add edit button + dialog to Sales Records page (pre-fill current values)
- [x] Insert placeholder sale records for O-001 and B-001 (price=0, pending)
- [x] TypeScript: 0 errors
- [x] All 48 unit tests pass
- [x] Save checkpoint

## Phase 21: Next Steps
- [x] Dashboard: add date-range picker (This Month / This Quarter / This Year / Custom) that drives all KPI cards and charts
- [x] Configuration Hub: add edit dialog for Animal Statuses tab
- [x] Configuration Hub: add edit dialog for Birth Types tab
- [x] Audit logging: add createAuditEntry to all config create/update procedures (species, category, group, birthType, expenseCategory, expenseSubCategory, setting, user)
- [x] Run full scenario test: 47+ pass, 0 fail
- [x] Save checkpoint (9078537e)

## Phase 22: Dark Theme + Audit Log Completion
- [x] Fix TypeScript errors in config router (entityId string cast, ResultSetHeader insertId)
- [x] .dark CSS variables already existed in index.css
- [x] Add theme toggle button (sun/moon) to DashboardLayout sidebar footer (expanded + collapsed states)
- [x] Persist theme preference in localStorage (ThemeContext already handles this with switchable=true)
- [x] Add Statuses and Birth Types edit dialogs to Configuration Hub
- [x] Add audit logging to all config create/update procedures
- [x] TypeScript: 0 errors
- [x] All 48 unit tests pass
- [x] Save checkpoint

## Phase 23: Notification Count Fix + Regression Test
- [x] Fix mark-all-read: invalidate notifications.list (unreadOnly: true) query after mutation
- [x] Fix mark-as-read single: same invalidation
- [x] Move scripts/scenario-test.mjs into project as tests/regression.mjs
- [x] Add "test:regression" npm script to package.json
- [x] Update regression test to cover config mutations and audit log for config (species entity)
- [x] TypeScript: 0 errors
- [x] All 48 unit tests pass
- [x] Regression test: 47 passed, 0 failed, 0 warnings
- [x] Save checkpoint

## Phase 24: Notification Count Reactivity Fix
- [x] Diagnose: tRPC invalidate() with input object only invalidates exact key match; sidebar uses different input variant
- [x] Fix: use queryClient.invalidateQueries({ queryKey: [["notifications", "list"]] }) to invalidate ALL variants at once
- [x] TypeScript: 0 errors
- [x] Save checkpoint

## Phase 25: Date Serialization Audit + Fix
- [x] Audit: MySQL date() columns return JS Date objects via Drizzle; String(date).substring(0,10) produces "Mon Mar 09" not "2025-03-09"
- [x] Fix Sales.tsx: 3 places where saleDate was pre-filled with String(date).substring(0,10) — now uses instanceof Date check with toISOString().split('T')[0]
- [x] Confirmed all other pages (Animals, Expenses, Breeding, Feed, Weight) use <input type="date"> which always returns YYYY-MM-DD — no other broken patterns found
- [x] TypeScript: 0 errors
- [x] 48/48 unit tests pass
- [x] Save checkpoint

## Phase 26: Mark-All-Read Bug Fix
- [x] Debug: all notifications have userId=NULL (system-generated alerts); markAllRead used WHERE userId=? which matched nothing
- [x] Fix: markAllNotificationsRead now uses OR(userId=?, userId IS NULL) to cover both user and system notifications
- [x] TypeScript: 0 errors
- [x] Save checkpoint

## Phase 27: Ration Plan Audit & Fix
- [x] Compare ration plan data in DB against original Excel
- [x] Audit days-remaining calculation in server/db.ts and Feed Management page
- [x] Fix any incorrect data or calculation bugs (12 duplicate rows deleted, quantities corrected)
- [x] TypeScript: 0 errors
- [x] Save checkpoint (4cdb2cf4)

## Phase 27: Full Excel Import Audit
- [x] Read all Excel sheets and extract raw data
- [x] Compare animals (tag, species, category, status, dates) against DB
- [x] Compare ration plans (category, feed item, qty) against DB
- [x] Compare feed stock ledger (purchases, stock counts) against DB
- [x] Compare expenses against DB
- [x] Compare sales against DB
- [x] Delete all test-generated data (14 scenario test stock entries, 12 duplicate ration plan rows)
- [x] Re-import missing records: E-049, K-009 (animals), 3 Chicken Feed stock entries, 25 real expenses (EGP 67,017)
- [x] Fixed sale prices: O-001=27,000 EGP, B-001=15,000 EGP
- [x] Fixed ration plan quantities: Ram 1.6 kg/day, Fattening 2.25 kg/day, Ewe 1.55 kg/day, Baby Goat 0.4 kg/day
- [x] Regression test: 46 passed, 0 failed, 1 warning (expected)
- [x] Save checkpoint and deliver audit report

## Phase 28: Edit Ration Plan + Low Stock Notifications

- [x] Fix Fattening category ration quantities in DB (0.75 kg Alfalfa Hay, 0.50 kg Hay, 1.00 kg Concentrate 16%)
- [x] Add updateRationPlan procedure to feed router (qty, effectiveDate, endDate)
- [x] Add Edit Ration Plan dialog to Feed Management page (pencil icon per row, pre-filled form)
- [x] Add Low Stock Alerts banner to Feed Management page showing items below threshold
- [x] Wire low stock check to run on server startup + every hour (lowStockCheck.ts)
- [x] Deduplication: skip notification if unread alert exists for same item in last 24h
- [x] TypeScript: 0 errors
- [x] All 53 unit tests pass (5 new tests added)
- [x] Save checkpoint

## Phase 29: P&L per Animal Review & Fix

- [x] Audit getAnimalPnL: logic is correct (purchaseCost, feedCost, directExpenseTotal, revenue, netPnL)
- [x] Confirmed daysOnFarm uses exitDate (or today) minus acquisitionDate
- [x] Confirmed feed cost uses ration plan qty × days × feed price on acquisition date
- [x] Confirmed revenue from sales table, direct expenses from expenses.targetType='head'
- [x] FIXED: PnL.tsx was showing all dashes — never called getPnL, only animals.list
- [x] Added getAllAnimalsPnL bulk function to db.ts (avoids N+1 queries)
- [x] Added animals.getAllPnL tRPC procedure with species/category filters
- [x] Rewrote PnL.tsx to show real data: all cost columns, revenue, netPnL, cost/day, summary cards
- [x] Added species, category, and active/inactive filters to PnL page
- [x] TypeScript: 0 errors
- [x] 57 unit tests pass (4 new P&L tests added)
- [x] Save checkpoint

## Phase 30: Edit & Delete for Fattening Tracker and Stock Ledger

- [x] Add Edit Animal dialog to Fattening Tracker rows (group, notes)
- [x] Add Delete (to Recycle Bin) action to Fattening Tracker rows
- [x] Add Record Weight per-row button to Fattening Tracker
- [x] Add Current Weight, % to Target columns to Fattening Tracker table
- [x] Add updateFeedStockEntry helper to db.ts
- [x] Add updateStockEntry tRPC procedure to feed router
- [x] Add Edit Stock Entry dialog to Stock Ledger rows (date, type, qty, unit cost, total cost, supplier, notes)
- [x] Delete action verified working on Stock Ledger
- [x] Animal P&L: active animals show Ongoing (neutral) instead of red loss
- [x] Animal P&L: summary cards split into Realised Revenue, Running Cost (Active), Realised Net P&L
- [x] TypeScript: 0 errors
- [x] 57 tests pass
- [x] Save checkpoint

## Phase 31: Full Page Data Audit & Fixes

- [x] Animal P&L: show real statusName (Active, Dead, Sold, Ill/Slaughter) — added animalStatuses join to getAllAnimalsPnL
- [x] Animal P&L: status filter now shows real status names from data (not hardcoded Active/Inactive)
- [x] Audit Dashboard: KPIs correct (137 active, EGP 42,000 revenue, EGP 67,017 expenses)
- [x] Audit Animal Registry: all columns correct
- [x] Audit Animal Profile: all tabs verified
- [x] Audit Breeding & Lambing: 0 records (no births yet) — loading state fixed to skeleton rows
- [x] Audit Fattening Tracker: 74 Fattening animals, weights and days on farm correct
- [x] Audit Feed Management: 21 stock entries, 33 ration plans, 8 feed items — all correct
- [x] Audit Expense Log: 25 expenses, EGP 67,017 total — all correct
- [x] Audit Sales Records: 2 sales (O-001 EGP 27,000, B-001 EGP 15,000) — all correct
- [x] Income Statement: added Feed Stock Purchases line (from feed_stock_ledger) to costs breakdown
- [x] Income Statement: loading state fixed to skeleton rows
- [x] TypeScript: 0 errors, 57 tests pass
- [x] Save checkpoint

## Phase 32: Mobile Responsiveness & UX Review
- [ ] Fix DashboardLayout sidebar: mobile drawer with backdrop overlay, closes on nav item click
- [ ] Make Dashboard page mobile-friendly (KPI cards stack, charts scroll)
- [ ] Make Animal Registry mobile-friendly (table → card list on mobile)
- [ ] Make Fattening Tracker mobile-friendly
- [ ] Make Feed Management mobile-friendly
- [ ] Make Expense Log mobile-friendly
- [ ] Make Sales Records mobile-friendly
- [ ] Make Animal P&L mobile-friendly
- [ ] Make Income Statement mobile-friendly
- [ ] Make Breeding & Lambing mobile-friendly
- [ ] Make Animal Profile tabs mobile-friendly
- [ ] Review all dialogs/modals for mobile usability
- [ ] Review Excel export: correct columns, all data included
- [ ] Review Excel import: validation, error messages, correct mapping
- [ ] Review all calculations for accuracy
- [ ] TypeScript: 0 errors, all tests pass
- [ ] Save checkpoint

## Phase 32: Mobile Responsiveness & Full UX Review
- [x] Fix DashboardLayout mobile sidebar: collapsible=offcanvas, close on nav click
- [x] Dashboard: KPI grid stacks to 1-col on mobile, filter row wraps
- [x] Animals: header stacks, dialog max-w on mobile, table horizontal scroll
- [x] Expenses: header stacks, dialog full-width, skeleton loading rows added
- [x] Sales: header stacks, dialog full-width, skeleton loading rows added
- [x] PnL: header stacks, summary cards 1-col on mobile, filters wrap
- [x] Fattening: header stacks, dialogs full-width on mobile
- [x] Feed: header stacks, dialogs full-width, grid cols stack on mobile
- [x] Breeding: header stacks, dialog full-width, grid cols stack on mobile
- [x] IncomeStatement: header stacks, buttons wrap, date inputs stack
- [x] Data page: added Export to Excel card (was missing — only Import/Backup existed)
- [x] Reviewed all calculations: all correct
- [x] Reviewed all loading states: all pages use Skeleton components
- [x] TypeScript: 0 errors, 57 tests pass
- [x] Save checkpoint

## Phase 33: PR Review Bug Fixes
- [x] Fix acquisition type filter not working on Animals page (confirmed working — all 16 born animals are active, filter is correct)
- [x] Fix createGroup() dropping latitude/longitude (bug #1)
- [x] Fix costPerMonth division by zero in getAnimalPnL (bug #2)
- [x] Fix costPerDay/costPerMonth: purchaseCost Drizzle Decimal object not coerced → toMinor returns 0 → operatingCost = totalCost (bug #3)
- [x] Fix "Current Account Value" formula in PnL page (revenue + capital on hoof - operating costs of active herd)
- [x] Remove GroupMap component and its references from Dashboard
- [x] Fix expenses router TS2345: stale LSP cache, tsc --noEmit confirms 0 errors

## Phase 34: Bulk Ration Plan Date Update
- [x] Add tRPC procedure `feed.bulkUpdateRationPlanDates` — accepts array of plan IDs + new effectiveDate, updates all in one transaction
- [x] Add bulk update UI in Feed Management page — checkbox selection on ration plan rows + "Update Date" action button with date picker dialog
- [x] Add i18n keys (EN + AR) for bulk date update UI

## Phase 35: Defensive Date Normalization in computeFeedCostForPeriod
- [x] Add normalizeDate() guard inside computeFeedCostForPeriod to handle any non-ISO date strings (e.g. locale strings from String(Date)) — throws descriptive error instead of RangeError at toISOString()
- [x] TypeScript: 0 errors, 87/87 tests pass
