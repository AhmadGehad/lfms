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
