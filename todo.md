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
- [x] Add dateNormalize.test.ts with 4 regression tests covering ISO passthrough, locale string normalization, invalid date error, and math correctness
- [x] TypeScript: 0 errors, 91/91 tests pass

## Phase 36: Read-Only Viewer Role
- [x] Update user role enum in schema to include "viewer" role
- [x] Generate and apply database migration for new role (ALTER TABLE users MODIFY COLUMN role enum with viewer added)
- [x] Create blockViewerMutationMiddleware that blocks all mutations for viewers
- [x] Update all tRPC procedures to use blockViewerMutationMiddleware globally (applied to publicProcedure, protectedProcedure, adminProcedure, and all role-based procedures)
- [x] Create ActionButton and ActionButtonGroup components to hide/disable actions for viewers
- [x] Create useIsViewer hook for checking viewer role
- [x] Add i18n translations for viewer role (EN + AR)
- [x] TypeScript: 0 errors (excluding known expenses.ts false positive)
- [x] All 92 tests passing


## Phase 37: User Role Management UI
- [x] Update user creation to set default role to "viewer" instead of "user" (upsertUser in db.ts)
- [x] Add role selector dropdown in user management UI (UserManagement.tsx with Select component)
- [x] Add role change mutation to backend (updateUserRole in config.ts router)
- [x] Add role change UI in user list/management page (role selector dropdown replaces promote/demote button)
- [x] Add i18n keys for role management UI (users.viewer, users.user, users.staff, users.supervisor, users.admin, users.owner)
- [x] Test role changes across all user types (all 92 tests passing)


# ════════════════════════════════════════════════════════════════════════════
# MULTI-TENANT, COMPANY-BASED SaaS TRANSFORMATION (Phases 38–55)
# ════════════════════════════════════════════════════════════════════════════
#
# GOAL: Convert the single-farm LFMS into a multi-tenant SaaS where many
# agricultural companies each get an isolated workspace, with multiple farms,
# users, and fully segregated data, settings, and permissions.
#
# ARCHITECTURE: See docs/TENANCY_DESIGN.md (rev 4 — third security review incorporated)
#
# CORE SECURITY PRINCIPLES (non-negotiable):
#   1. companyId derived from authenticated session/route — NEVER from request body
#   2. Every query/mutation takes TenantContext (compile-time enforced, no defaults)
#   3. Composite foreign keys at DB level prevent cross-tenant relationships
#   4. Opaque server-side sessions (not JWT-in-cookie) with revocation + pepper
#   5. Route-based tenant context (/c/{slug}/...) — no company_id in session for auth
#   6. Explicit farm_access_mode enum (never inferred from absence of rows)
#   7. Farm scope enforced on EVERY query (restricted users get assigned farms only)
#   8. Outbox pattern for all email/notification/billing side effects
#   9. Atomic quota enforcement via locked company_usage_current row in same tx as resource
#  10. Identity separation: user_identities + password_credentials (no auto-linking)
#  11. Per-company MFA enforcement with step-up auth + TOTP replay prevention
#  12. Company deletion state machine (no auto-hard-delete from webhooks)
#  13. Quarantine-based file upload pipeline with explicit link tables (no polymorphic)
#  14. Append-only audit log with insert-only DB credentials + per-company hash chain
#  15. CSRF: SameSite=Lax + signed token + custom header + Origin validation
#  16. Generated columns for soft-delete-safe unique constraints (all soft-deletable tables)
#  17. Opaque public IDs (ULID) for all external references
#  18. Explicit command types (never Partial<Entity>) — no mass assignment
#  19. auth_version (users) + authorization_version (company_users) for session invalidation
#  20. authentication_tokens table (verify_email, reset_password, change_email, identity_link)
#  21. mfa_credentials + mfa_recovery_codes tables (envelope-encrypted, TOTP step tracking)
#  22. Email verification single source: user_identities.provider_email_verified via primary_email_identity_id
#  23. Outbox encrypted payloads for tokens (erased after sending) + worker leasing
#  24. Idempotency keys: per-tenant uniqueness + body hash conflict detection
#  25. Role permissions with effect ENUM('allow','deny') for explicit deny
#  26. owner_company_guard generated column (at most one active owner per company)
#  27. All new tables have FKs with explicit ON DELETE behavior
#  28. Actor columns reference memberships (not global users) where applicable
#  29. Dual-write migration (not nullable→NOT NULL with legacy still inserting nulls)
#  30. Queue workers load authoritative DB row, don't trust company_id from message
#  31. Immutable farm snapshots on historical records (weight, vaccination, lambing, sales, status)
#  32. current_company_guard generated column (at most one current subscription per company)
#  33. Permission unique key WITHOUT effect column; layered deny-first evaluation
#  34. Permission cache versioned: perm:{cid}:{permissionsVersion}:{role}
#  35. Bootstrap endpoints for partial sessions (verify-email, MFA enroll, logout)
#  36. PlatformContext for system jobs + platform admin (separate from TenantContext)
#  37. platform_admins table replaces users.role for platform authorization
#  38. Auth tokens bound to user_identity_id for verify_email/identity_link
#  39. TOTP replay prevention via atomic last_used_totp_step update
#  40. MFA v1: TOTP only (WebAuthn requires separate table)
#  41. Registration with existing email → secure account-link/recovery flow
#  42. WebSocket authorization at subscription/channel level (not only on connect)
#  43. Outbox deduplication_key has actual UNIQUE constraint
#  44. Company-wide visibility = regardless of farm assignment, NOT regardless of RBAC
#
# CURRENT STATE (verified): 21 tables, none have companyId/farmId. Auth is
# OAuth→JWT cookie→users.openId. Permissions are global role rows. Many tables
# have GLOBAL unique constraints that must become per-tenant composite uniques.
# ────────────────────────────────────────────────────────────────────────────

## Phase 38: Tenancy Data Model (Foundation)
- [ ] Create all new tables per TENANCY_DESIGN.md §4: `companies`, `farms`, `company_users`, `company_user_farms`, `company_invitations`, `company_security_policies`, `company_usage_current`, `company_subscriptions`, `subscription_plans`, `usage_daily`, `sessions`, `user_identities`, `password_credentials`, `authentication_tokens`, `mfa_credentials`, `mfa_recovery_codes`, `outbox_events`, `idempotency_keys`, `billing_webhook_events`, `file_attachments`, `animal_attachments`, `company_logo_attachments`, `expense_attachments`, `data_export_jobs`, `company_deletion_requests`, `platform_admins`
- [ ] Add `companyId` (nullable initially) + `public_id BINARY(16)` to all 24 tenant-scoped tables
- [ ] Add `farmId` per config sharing model: NOT NULL on `groups`, `animals`, `feed_stock_ledger`; **immutable snapshot** on `weight_log`, `lambing_log`, `vaccination_records`, `sales`, `animal_status_history` (set at event creation, never updated on animal move); nullable on `expenses` (with `scope_type`), `ration_plans`, `feed_item_price_history`, `notifications`, `audit_log`
- [ ] Add `farm_access_mode ENUM('all','restricted')` to `company_users` (NOT NULL DEFAULT 'restricted')
- [ ] Add `authorization_version INT NOT NULL DEFAULT 1` to `company_users`
- [ ] Add `owner_company_guard` generated column on `company_users` (UNIQUE — at most one active owner per company)
- [ ] Add `current_company_guard` generated column on `company_subscriptions` (UNIQUE — at most one current subscription per company)
- [ ] Add `lifecycle_status ENUM('active','suspended_by_admin','deletion_requested','purging')` to `companies` (no owner_user_id, no status/plan fields)
- [ ] Add `email_normalized`, `primary_email_identity_id` (composite FK to user_identities), `auth_version`, `failed_login_attempts`, `locked_until`, `last_password_change` to `users` (NO email_verified — derived from primary identity)
- [ ] Add `action_category` (nullable initially), `membership_id`, `session_id`, `request_id`, `outcome` to `audit_log` (company_id nullable initially — same migration pattern as all tenant tables)
- [ ] Add `effect ENUM('allow','deny')` to `role_permissions` (rename `page` to `resource`); UNIQUE without `effect` column
- [ ] Add `user_identity_id` to `authentication_tokens` (binds token to specific identity for verify_email/identity_link)
- [ ] Add all FKs to new tables with explicit ON DELETE behavior
- [ ] Actor columns reference memberships via composite FKs (created_by_membership_id, etc.) not global users
- [ ] Create `platform_admins` table (replaces deprecated `users.role` for platform authorization)

## Phase 39: Per-Tenant Unique Constraints + Composite FKs (DB-Enforced Isolation)
- [ ] Add composite unique keys `(company_id, id)` on all FK target tables (farms, species, categories, statuses, groups, owners, birth_types, feed_items, vaccines, expense_categories, expense_sub_categories)
- [ ] Add composite foreign keys on ALL tenant relationships (animals→farm/category/species/status/group/owner, lambing_log→dam/sire/farm, vaccination_records→animal/vaccine/farm, weight_log→animal/farm, sales→animal/farm, animal_status_history→animal/farm, feed_stock_ledger→farm/feed_item, ration_plans→category/feed_item, expenses→category/subcategory/head)
- [ ] Historical records (weight_log, lambing_log, vaccination_records, sales, animal_status_history) have BOTH `(company_id, animal_id)` and `(company_id, farm_id)` composite FKs — farm_id is immutable snapshot
- [ ] Replace global uniques with generated-column soft-delete-safe uniques on ALL soft-deletable tables: `active_normalized_name` on species/statuses/birth_types/feed_items/vaccines/expense_categories; `active_normalized_code` on groups AND farms; `active_animal_id` on animals; `active_lamb_id` on lambing_log; `active_setting_key` on system_settings
- [ ] Add hard unique on `role_permissions(company_id, role, resource, action)` (WITHOUT effect — effect is the configured value, not part of identity)
- [ ] Add composite indexes `(company_id, deleted_at)` and `(company_id, farm_id)` on all high-traffic tables
- [ ] Move ID sequences to per-company `company_category_sequences(companyId, categoryId, idSequence, lambIdSequence)`

## Phase 40: Opaque Server-Side Sessions + Route-Based Tenant Resolution
- [ ] Create `sessions` table (session_id_hash=SHA-256(token+pepper), user_id, last_selected_company_id=UX-only, authentication_level, mfa_verified_at, authentication_methods, user_auth_version, created_at, last_seen_at, idle_expires_at, absolute_expires_at, revoked_at, ip_address, user_agent)
- [ ] Replace JWT-in-cookie with `__Host-lfms_session=<opaque 256-bit token>` (HttpOnly, Secure, SameSite=Lax, Path=/, no Domain, no cookie signing needed)
- [ ] Add server-side pepper to session token hashing
- [ ] Rewrite `createContext`: hash token+pepper → load session → verify not revoked/expired → verify user_auth_version matches users.auth_version → load user → load memberships → resolve company from ROUTE `/c/{slug}` (NOT session) → validate membership active + company not suspended + authorization_version matches + MFA policy satisfied → build `TenantContext`
- [ ] NO `company_id` in sessions for authorization — `last_selected_company_id` is UX preference only
- [ ] No automatic fallback to first membership — return `COMPANY_SELECTION_REQUIRED`
- [ ] Never mutate cookies inside `createContext`
- [ ] No session rotation when navigating between companies (different tabs = different routes)
- [ ] Company switch endpoint (`POST /api/preferences/last-company`) updates UX preference only — does NOT change security context
- [ ] Throttle `last_seen_at` updates (once per 5 min) — avoid DB write on every request
- [ ] Session reads from primary DB (not lagging replica)
- [ ] Max 5 active sessions per user
- [ ] `users.auth_version` bump on password change/MFA reset → invalidates all sessions
- [ ] `company_users.authorization_version` bump on role/status/farm-access change → takes effect immediately (membership loaded per request)
- [ ] Keep OAuth path working alongside new session system (user_identities with provider='manus')

## Phase 41: TenantContext Repository Layer (Compile-Time Enforced, No Mass Assignment)
- [ ] Define `TenantContext` type: `{ companyId, membershipId, userId, membershipRole, accessibleFarmIds: readonly FarmId[] | "all", farmAccessMode: "all" | "restricted", permissionOverrides, authLevel, sessionId }`
- [ ] Refactor ALL `db.ts` functions to take `TenantContext` as first param — **mandatory, no default, no bare companyId**
- [ ] Every query: `WHERE company_id = ctx.companyId`; every create: `SET company_id = ctx.companyId`
- [ ] Every update/delete: use `public_id` + tenant predicates (never by internal id alone); verify company + farm scope before mutating
- [ ] Use explicit command types (e.g., `UpdateAnimalCommand`) — NEVER `Partial<Animal>` (mass assignment risk)
- [ ] Separate operations: `moveAnimal(ctx, animalPublicId, targetFarmPublicId)`, `archiveAnimal(ctx, animalPublicId)`, `restoreAnimal(ctx, animalPublicId)`
- [ ] Farm scope enforcement on EVERY farm-scoped query: restricted users without farmId get `inArray(farmId, accessibleFarmIds)` NOT all company farms
- [ ] `applyFarmScope()` helper: 'all' mode + no farmId = all farms; 'restricted' + no farmId = assigned farms only; 'restricted' + farmId = assert access + filter
- [ ] Update cross-table subqueries (effectiveDamId/sireId, latestWeight, nextVaccineDate) to be company-scoped
- [ ] Move repository functions into `server/repository/` modules; ban direct table access outside them
- [ ] Add raw SQL allowlist for any `sql\`...\`` templates

## Phase 42: API Authorization Hardening + CI Enforcement
- [ ] Migrate all 16 routers onto `companyProcedure` (rejects no-tenant/suspended/no-MFA)
- [ ] Permission precedence (layered, deny-by-default): platform → company → membership/security → any explicit deny → any explicit allow → baseline role → default deny → farm scope → object/state rules
- [ ] `role_permissions` with `effect ENUM('allow','deny')` — UNIQUE without effect column; layered evaluation (not "first match wins")
- [ ] Permission cache versioned: `perm:{companyId}:{permissionsVersion}:{role}` — increment permissionsVersion on role permission changes
- [ ] Company-wide visibility = regardless of farm assignment, NOT regardless of RBAC permission
- [ ] Response codes: 401 unauthenticated, 403 within-tenant denied, 404 cross-tenant/not-found, 403 COMPANY_SUSPENDED, 403 COMPANY_SELECTION_REQUIRED, 403 MFA_REQUIRED
- [ ] Farm response codes: 404 farm doesn't exist in tenant, 403 exists but not assigned, 400 malformed id
- [ ] Never perform global lookups (always filter by company_id first) — prevents revealing another tenant's resource existence
- [ ] Role hierarchy rules: admin can't manage owners, can't promote to owner, can't disable another admin unless explicitly allowed, users can't change own role/farm access
- [ ] PlatformContext type for system jobs and platform admin (separate from TenantContext, never from public endpoints)
- [ ] Platform repositories: platformCompanyRepository, billingRepository, tenantProvisioningRepository, systemJobRepository — narrowly scoped, no generic cross-tenant query
- [ ] `users.role` deprecated — replaced by `platform_admins` table; legacy role removed from all authorization paths
- [ ] Cross-tenant integration tests: company A user vs company B data for EVERY endpoint
- [ ] Mutation tests: remove companyId predicate → CI fails
- [ ] Custom ESLint/AST rule: ban `.from()/.insert()/.update()/.delete()` outside `server/repository/`
- [ ] Tests for caches, exports, queues, scheduled jobs, imports, files, reports
- [ ] Audit bulk endpoints for per-id companyId verification

## Phase 43: Identity Separation + Auth Architecture
- [ ] Create `user_identities` (user_id, provider, provider_subject, provider_email, provider_email_verified, UNIQUE(provider, provider_subject), UNIQUE(user_id, provider))
- [ ] Create `password_credentials` (user_id, password_hash argon2id, password_changed_at, password_needs_rehash)
- [ ] Create `authentication_tokens` (user_id, user_identity_id, purpose ENUM('verify_email','reset_password','change_email','identity_link'), token_hash BINARY(32) UNIQUE, target_value, attempts, expires_at, used_at)
- [ ] Email/password signup: min 15 chars, max 64, no composition rules, compromised-password blocklist, argon2id with benchmarked params, rehash-on-login
- [ ] Never auto-link OAuth and password accounts by email match — require verified provider email + reauthentication
- [ ] Registration with existing email_normalized → secure account-link/recovery flow (no auto-link, no duplicate user)
- [ ] OAuth security: state + PKCE + OIDC nonce + exact redirect URI allowlist
- [ ] Platform role must never be derived from OAuth provider metadata
- [ ] Email normalization: trim + domain normalization + controlled case handling. NO provider-specific transformations (no Gmail dot/+tag removal)
- [ ] Email verification: single source of truth via `user_identities.provider_email_verified` on `primary_email_identity_id` (NO `users.email_verified` column)
- [ ] `primary_email_identity_id` uses composite FK ensuring identity belongs to same user
- [ ] Password recovery: single-use reset token in `authentication_tokens` (hashed), 1h expiry, increment `users.auth_version` on reset
- [ ] Progressive lockout: 1min/2min/5min/10min/30min delays, combined IP+account+device limits (not simple 24h lock)
- [ ] Generic login/reset responses (no account enumeration)

## Phase 44: MFA Architecture (Per-User Enrollment, Per-Company Enforcement)
- [ ] Create `company_security_policies` (require_mfa, allowed_mfa_methods, privileged_session_max_age, require_mfa_for_owners/billing/data_export)
- [ ] Create `mfa_credentials` (user_id, method ENUM('totp') — v1 TOTP only, encrypted_secret BLOB, encryption_key_version, last_used_totp_step, enabled_at, disabled_at, UNIQUE(user_id, method))
- [ ] Create `mfa_recovery_codes` (mfa_credential_id, code_hash argon2id, used_at)
- [ ] TOTP enrollment: generate secret, QR code, verify first code, backup codes (argon2id hashed, single-use)
- [ ] TOTP secrets: envelope-encrypted with key versioning
- [ ] `last_used_totp_step` updated atomically: `UPDATE ... WHERE last_used_totp_step < current_step` (0 rows affected = replay, reject)
- [ ] WebAuthn: v1 excludes from method enum; requires separate table (credential_id, public_key, sign_counter, transports, rp_id, rp_name) when added
- [ ] Session records `mfa_verified_at` + `authentication_methods`
- [ ] Step-up authentication when switching into company requiring MFA
- [ ] Bootstrap endpoints for partial sessions: /auth/verify-email, /auth/mfa/enroll, /auth/mfa/confirm, /auth/recovery-codes, /auth/logout — block tenant mutations until verification + MFA complete
- [ ] MFA required for: owners, platform admins, billing changes, ownership transfer, data exports, API-key creation, disabling MFA

## Phase 45: Company Registration & Onboarding (Transactional + Outbox)
- [ ] Registration: single transaction creates user + user_identities + password_credentials + company + company_users (owner, farm_access_mode='all') + company_security_policies + company_subscriptions (trialing, trial_ends_at=+14d, is_current=true) + company_usage_current + default farm + seeded reference data + authentication_tokens (verify_email) + outbox event with encrypted_payload containing raw token
- [ ] Outbox worker: claim event (locked_by + locked_until), decrypt payload, send email, delete/erase encrypted payload, mark sent
- [ ] Never send email inside DB transaction; never store raw tokens in plaintext JSON
- [ ] Company slug generation + reserved-name checks
- [ ] Onboarding wizard: company profile → farm setup → reference data review → invite team → import data → complete
- [ ] Seed routine: clone default templates with company_id, using composite FKs

## Phase 46: Multi-Farm Management (Explicit Access Mode)
- [ ] Farms CRUD UI under company settings (admin+, max_farms from plan)
- [ ] Farm switcher in app shell (localStorage, NOT in session/JWT)
- [ ] `farm_access_mode='all'`: access all farms (owners default). `'restricted'`: only `company_user_farms` entries. Never infer from absence of rows.
- [ ] Restricted users: "All Farms" = all ASSIGNED farms, NOT all company farms
- [ ] Farm-restricted users can view company-wide records but not farm-scoped records for non-assigned farms
- [ ] Move-animal-between-farms: `moveAnimal(ctx, animalPublicId, targetFarmPublicId)` — separate operation, transactional, verify both belong to ctx.companyId, audit log
- [ ] Reporting: Dashboard/P&L/Income Statement default all farms with per-farm filter; Feed/Fattening/Breeding require farm selection

## Phase 47: Membership, Roles & Invitations (Transactional + Outbox)
- [ ] Invitation: generate crypto.randomBytes(32), store SHA-256 hash in `company_invitations`, 7d expiry, outbox event with encrypted_payload for email
- [ ] Acceptance: verify token hash, check expiry/used, verify email match (case-insensitive), create company_users, mark accepted, audit — all in one transaction
- [ ] Per-company role assignment in company_users (not users.role)
- [ ] Role management: admin+ for view/invite/change/disable/remove; owner for transfer; admin can't manage owners or promote to owner; users can't change own role/farm access
- [ ] Ownership transfer: requires recent MFA/re-authentication, transactional + SELECT FOR UPDATE
- [ ] Last-owner protection: `owner_company_guard` generated column UNIQUE at DB level; application enforces at least one owner
- [ ] Re-scope UserManagement + permissions pages to active company
- [ ] Max 10 pending invitations per company; cannot invite to owner role

## Phase 48: Audit, Compliance & Platform Administration
- [ ] Audit log: company_id (nullable→backfill→NOT NULL), farm_id, action_category, membership_id, session_id, request_id, outcome
- [ ] Append-only enforcement: insert-only DB credentials, external immutable log destination (CloudWatch/S3 Object Lock)
- [ ] Hash chaining: per-company chain with locked chain-head row (NOT simple prev-row hash which races under concurrent inserts)
- [ ] Separate security audit stream (cross-tenant denials, auth) from business activity logs
- [ ] Cross-tenant denials → platform security log (not tenant-visible)
- [ ] Redaction: strip passwords/tokens/secrets/sensitive bodies
- [ ] Platform admin: time-limited MFA break-glass, no permanent browsing, all audited
- [ ] GDPR: data_export_jobs (async, presigned URL), company_deletion_requests (state machine: requested→exported→legal_hold→approved→purging→completed)
- [ ] Backup deletion limitations documented: retention period, crypto-erasure options, deletion tombstones, post-restore purge procedure, customer notification

## Phase 49: Secure File Storage & Encryption (Quarantine Pipeline + Explicit Links)
- [ ] `file_attachments` table with public_id (ULID), company_id, status (pending/quarantine/clean/rejected/deleted) — NO polymorphic entity_type/entity_id — with composite unique key `(company_id, id)` for link table FKs
- [ ] Explicit link tables: `animal_attachments`, `company_logo_attachments`, `expense_attachments` — each with composite FKs
- [ ] Actor FKs: `uploaded_by_membership_id` uses composite FK `(company_id, membership_id) → company_users(company_id, id)`
- [ ] Storage key: `private/company/{companyPublicId}/attachments/{attachmentUuid}/original` (never predictable animal IDs)
- [ ] Upload pipeline: pending record → authorize entity+quota via link table → presigned PUT to quarantine → verify size/magic bytes/checksum/decoder → re-encode to strip metadata → scan → move to clean or reject → create link table entry → download only for clean
- [ ] Delete abandoned pending/multipart uploads (cron)
- [ ] S3: Block Public Access (account+bucket), ACLs disabled (bucket-owner-enforced), SSE-KMS
- [ ] Presigned URLs: signing role accesses only required bucket/prefix/operations
- [ ] Encryption: TLS 1.2+ + HSTS in transit, TDE/disk-level at rest, SSE-KMS for S3, secrets in secrets manager, MFA secrets envelope-encrypted with key versioning

## Phase 50: Subscriptions, Billing & Usage Limits (Atomic + Resilient)
- [ ] `subscription_plans` (max_farms/max_animals/max_users: NULL=unlimited, currency, stripe_price_id, plan_version) + `company_subscriptions` (provider_status, trial_ends_at, grace_ends_at, plan_snapshot, is_current, current_company_guard generated column UNIQUE, external_customer_id UNIQUE, external_subscription_id UNIQUE)
- [ ] Centralized entitlement service derives access from lifecycle_status + provider_status
- [ ] `company_usage_current` — locked/updated in SAME transaction as resource creation (atomic quota); decrement on delete/archive; increment on restore
- [ ] `usage_daily` for analytics only (not quota source)
- [ ] Quota reconciliation job: recalculate from source tables, alert on differences
- [ ] `billing_webhook_events` inbox: verify Stripe signature, store transactionally, return 200, process async with worker leasing (locked_by/locked_until), idempotent by provider_event_id, handle out-of-order, Stripe idempotency keys for outbound
- [ ] Company deletion state machine (no auto-hard-delete from webhook): requested→exported→legal_hold→approved→purging→completed
- [ ] Suspension flow: trialing=full until trial_ends_at, active=full, past_due=read-only until grace_ends_at then suspended, suspended_by_admin=read-only, deletion_requested=read-only, purging=no access
- [ ] Usage metering: daily snapshot + Redis API call counter (keyed by company_id) + alert at 80%/95%

## Phase 51: CSRF Protection (Complete, Not Just SameSite)
- [ ] Change `sameSite` from `none` to `lax` (useful but not sufficient)
- [ ] Signed, session-bound CSRF token (double-submit pattern)
- [ ] Custom header required on all mutations (e.g., `X-LFMS-CSRF: {token}`)
- [ ] Origin header validation with controlled Referer fallback
- [ ] Exact credentialed CORS allowlist (no wildcards)
- [ ] No mutations through GET
- [ ] CSRF on: company switch, logout, email changes, MFA, invitations, billing

## Phase 52: Outbox + Async Tenant Propagation
- [ ] `outbox_events` for all email/notification/billing side effects (never send inside DB transaction)
- [ ] Outbox: encrypted_payload for tokens (envelope encryption, erased after sending), worker leasing (locked_by/locked_until), deduplication_key with actual UNIQUE constraint `(company_id, event_type, deduplication_key)`
- [ ] Outbox worker: claim event, deliver, retry with backoff, max 5 attempts, recover crashed events after lease expiry
- [ ] Queue workers: load authoritative DB row by event_id/job_id, derive company context — do NOT trust company_id from message alone
- [ ] Tenant propagation across all async systems: Redis cache keys (`perm:{cid}:{permVer}:{role}`, `rate:{cid}:{uid}`, `kpi:{cid}:{hash}`), background workers, scheduled jobs (per-company iteration), WebSockets (company_id bound to connection + subscription/channel-level authorization + membership revalidation on room join), search indexes, file metadata, email notifications, analytics, CSV/Excel exports, imports, error logs/tracing

## Phase 53: Scalability, Backups & Disaster Recovery
- [ ] Composite indexes `(company_id, ...)` on all tenant tables
- [ ] Connection pooling (mysql2 or ProxySQL for read/write splitting)
- [ ] Redis: permission cache, session validation, rate limits, dashboard KPIs (TTL 60s)
- [ ] Per-tenant rate limiting: token bucket per (companyId, userId), configurable by plan
- [ ] Query timeout: 30s default, 60s reports (prevents noisy neighbor)
- [ ] Backups: full DB daily (30d retention), binlog continuous (7d), per-tenant export on-demand, S3 daily versioning + cross-region replication
- [ ] DR: RPO < 1h, RTO < 4h, automated failover (managed DB), monthly backup verification
- [ ] Monitoring: per-tenant error rate > 5%, slow queries > 5s, cross-tenant denied (any), quota > 95%, failed logins > 20/IP/5min, DB pool > 80%, disk > 85%, usage reconciliation mismatch

## Phase 54: Migration (Dual-Write, Zero Downtime, No Defaults)
- [ ] Phase 1: Create new tables, add nullable companyId + farmId + public_id, add composite unique keys alongside existing (do NOT drop old constraints yet); audit_log.company_id AND action_category nullable; role_permissions.company_id nullable
- [ ] Phase 2: Create default company (id=1) + farm (id=1); deploy DUAL-WRITE code that writes companyId/farmId/public_id for all new rows (legacy app continues but new rows have tenant columns)
- [ ] Phase 3: Backfill historical rows in bounded batches (1000 rows), generate ULIDs, run catch-up backfill for rows inserted during backfill, verify zero null rows + zero orphans
- [ ] Phase 4: Add composite FKs (including farm_id FKs on historical tables), make companyId NOT NULL, drop old global uniques, add generated-column uniques, add owner_company_guard, add current_company_guard, backfill action_category then make NOT NULL
- [ ] Phase 5: Deploy dual-read code, update createContext for TenantContext, add TenantContext to every db.ts function (MANDATORY, no default), migrate routers to companyProcedure, enable ESLint/AST rule, run cross-tenant + mutation tests
- [ ] Phase 6: Add email/password auth, create user_identities for OAuth users, create company_users for existing users, migrate to opaque sessions, create platform_admins table, deprecate users.role
- [ ] Phase 7: Verify counts, enable new-tenant registration, remove legacy code, drop old global indexes, rehearse rollback
- [ ] Use online DDL or online schema migration tool for large tables (ordinary ALTER TABLE may lock production)
- [ ] NEVER use `companyId = 1` as default parameter — hides missed migrations

## Phase 55: Cross-Cutting Acceptance Criteria
- [ ] Every db.ts method takes TenantContext (compile-time enforced, no bare companyId)
- [ ] Every query includes company_id in WHERE (CI-enforced via AST rule + mutation tests)
- [ ] Every farm-scoped query applies farm scope (restricted users get assigned farms only, NOT all company farms)
- [ ] Every update/delete uses public_id + tenant predicates (never by internal id alone)
- [ ] Every update uses explicit command types (never Partial<Entity>)
- [ ] Composite foreign keys on all tenant relationships (DB-enforced)
- [ ] Cross-tenant access returns 404; within-tenant denied returns 403; no global lookups
- [ ] No company_id in sessions for authorization (route-based context only)
- [ ] Opaque server-side sessions with revocation + pepper + auth_version
- [ ] Session reads from primary DB (not lagging replica)
- [ ] SameSite=Lax + signed CSRF token + custom header + Origin validation
- [ ] Passwords: argon2id, min 15 chars, compromised-password check, no composition rules
- [ ] All tokens in authentication_tokens (hashed); MFA secrets envelope-encrypted
- [ ] TOTP replay prevention via last_used_totp_step
- [ ] Progressive lockout (not simple 24h lock)
- [ ] Session invalidation via users.auth_version bump on password change/MFA reset
- [ ] Role changes via company_users.authorization_version (immediate, no session invalidation)
- [ ] Audit log: append-only (insert-only DB credentials), per-company hash chain, company-scoped
- [ ] File uploads: quarantine pipeline, explicit link tables, clean-only download
- [ ] Atomic quota enforcement (locked usage row in same transaction as resource creation)
- [ ] Quota reconciliation job
- [ ] Outbox pattern: encrypted payloads for tokens, worker leasing, erased after sending
- [ ] Webhook inbox with idempotent processing + worker leasing
- [ ] Identity separation (no auto-linking by email); email verification single source via primary_email_identity_id
- [ ] Explicit farm access mode (never inferred from absence); "All Farms" for restricted = assigned farms
- [ ] Generated columns for soft-delete-safe uniques (ALL soft-deletable tables including farms)
- [ ] owner_company_guard generated column (at most one active owner per company)
- [ ] Opaque public IDs (ULID) for all external references
- [ ] Company deletion state machine (no auto-hard-delete from webhook); backup limitations documented
- [ ] Idempotency keys: per-tenant uniqueness + body hash conflict detection
- [ ] Billing: trial_ends_at, grace_ends_at, plan_snapshot, is_current, currency, stripe_price_id, NULL=unlimited
- [ ] Role permissions: effect ENUM('allow','deny') for explicit deny
- [ ] Role hierarchy rules enforced (admin can't manage owners, can't change own role)
- [ ] All new tables have FKs with explicit ON DELETE behavior
- [ ] Actor columns reference memberships (not global users)
- [ ] Queue workers load authoritative DB row, don't trust company_id from message
- [ ] Immutable farm snapshots on historical records (weight, vaccination, lambing, sales, status history) — set at event creation, never updated on animal move
- [ ] Historical records have both `(company_id, animal_id)` and `(company_id, farm_id)` composite FKs
- [ ] `current_company_guard` generated column (at most one current subscription per company)
- [ ] Permission cache versioned: `perm:{companyId}:{permissionsVersion}:{role}`
- [ ] Permission evaluation: layered deny-first (not "first match wins")
- [ ] Company-wide visibility = regardless of farm assignment, NOT regardless of RBAC
- [ ] Bootstrap endpoints for partial sessions (verify-email, MFA enroll, logout) — prevents onboarding deadlock
- [ ] PlatformContext for system jobs and platform admin (separate from TenantContext, never from public endpoints)
- [ ] Platform repositories narrowly scoped (no generic cross-tenant query)
- [ ] `users.role` deprecated — replaced by `platform_admins` table
- [ ] Auth tokens bound to `user_identity_id` for verify_email/identity_link
- [ ] TOTP replay prevention via atomic `last_used_totp_step` update
- [ ] MFA v1: TOTP only (WebAuthn requires separate table)
- [ ] Registration with existing email → secure account-link/recovery flow
- [ ] WebSocket authorization at subscription/channel level (not only on connect)
- [ ] WebSocket membership revalidation on room join; revoke on membership change
- [ ] Outbox `deduplication_key` has actual UNIQUE constraint
- [ ] `file_attachments` has composite unique key `(company_id, id)` for link table FKs
- [ ] `sessions.last_selected_company_id` FK to companies ON DELETE SET NULL
- [ ] Migration: `role_permissions.company_id` and `audit_log.action_category` added nullable first
- [ ] Cross-tenant test matrix passes (100% of endpoints)
- [ ] Mutation tests pass (remove companyId → CI fails)
- [ ] All existing 92 unit tests updated for tenancy
- [ ] Existing production data migrated into default company without loss
- [ ] TypeScript: 0 errors; security review passed; pen test scheduled

