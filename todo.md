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
