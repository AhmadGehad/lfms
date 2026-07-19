# Livestock Farm Management System — Code Wiki

**Project:** Azal Farms (مزارع أزل)
**Version:** 9bcac83c
**Stack:** React 19 · Tailwind 4 · Express 4 · tRPC 11 · MySQL (TiDB) · Drizzle ORM
**Last Updated:** May 2026

---

## 1. Architecture Overview

The project is a monorepo with a single Node.js process serving both the API and the React frontend. In development, Vite runs as middleware inside Express. In production, the built client bundle is served as static files from the same Express server.

```
Browser  ──HTTP──►  Express (port 3000)
                        │
                        ├── /api/trpc/*   ──►  tRPC Router
                        │                          │
                        │                          ├── animals.*
                        │                          ├── breeding.*
                        │                          ├── config.*
                        │                          ├── dashboard.*
                        │                          ├── expenses.*
                        │                          ├── feed.*
                        │                          ├── sales.*
                        │                          ├── notifications.*
                        │                          ├── audit.*
                        │                          ├── recycleBin.*
                        │                          ├── userMgmt.*
                        │                          └── system.*
                        │
                        ├── /api/oauth/*  ──►  Manus OAuth Handler
                        ├── /manus-storage/*  ──►  S3 Storage Proxy
                        └── /*            ──►  Vite / Static Files
```

All business logic lives in `server/db.ts` (query helpers) and `server/routers/*.ts` (tRPC procedures). The frontend never calls the database directly — all data flows through tRPC.

---

## 2. Directory Structure

```
/home/ubuntu/lfms/
├── client/
│   ├── index.html              ← HTML entry point, Google Fonts CDN
│   ├── public/                 ← favicon.ico, robots.txt only
│   └── src/
│       ├── App.tsx             ← Route definitions, DashboardLayout wrapper
│       ├── main.tsx            ← React root, providers (tRPC, QueryClient, Theme, i18n)
│       ├── index.css           ← Tailwind base, CSS variables, theme tokens
│       ├── const.ts            ← getLoginUrl(), app constants
│       ├── lib/
│       │   ├── trpc.ts         ← tRPC client binding (createTRPCReact)
│       │   ├── i18n.ts         ← i18next setup, EN/AR locale loader
│       │   └── utils.ts        ← cn() class merge helper
│       ├── contexts/
│       │   └── ThemeContext.tsx ← Dark/light theme provider
│       ├── hooks/
│       │   ├── useMobile.tsx   ← Responsive breakpoint hook
│       │   └── usePersistFn.ts ← Stable function reference hook
│       ├── components/
│       │   ├── DashboardLayout.tsx  ← Sidebar nav, auth guard, user profile
│       │   ├── DashboardLayoutSkeleton.tsx ← Loading skeleton for layout
│       │   ├── AIChatBox.tsx   ← Streaming chat UI (unused in LFMS)
│       │   ├── Map.tsx         ← Google Maps wrapper (unused in LFMS)
│       │   └── ui/             ← shadcn/ui components (button, card, dialog, etc.)
│       └── pages/
│           ├── Home.tsx        ← Login landing page
│           ├── Dashboard.tsx   ← KPI cards, charts, low-stock alert
│           ├── Animals.tsx     ← Animal Registry table + Add/Edit dialogs
│           ├── AnimalProfile.tsx ← Per-animal detail tabs (Overview, Feed, Weight, P&L, Breeding)
│           ├── Breeding.tsx    ← Lambing log, Record Birth, Promote Lamb
│           ├── Fattening.tsx   ← Fattening tracker, weight recording, edit/delete
│           ├── Feed.tsx        ← Stock cards, Stock Ledger tab, Ration Plans tab
│           ├── Expenses.tsx    ← Expense log table + Add/Edit/Delete dialogs
│           ├── Sales.tsx       ← Sales records table + Add/Edit/Delete dialogs
│           ├── PnL.tsx         ← Animal P&L table with filters
│           ├── IncomeStatement.tsx ← Period income statement + PDF export
│           ├── Configuration.tsx   ← All reference data management
│           ├── Notifications.tsx   ← Notification centre
│           ├── AuditLog.tsx        ← Audit trail viewer
│           ├── RecycleBin.tsx      ← Soft-deleted records and restore
│           └── UserManagement.tsx  ← User role management
├── server/
│   ├── _core/
│   │   ├── index.ts            ← Express app setup, middleware, server start
│   │   ├── trpc.ts             ← tRPC init, publicProcedure, protectedProcedure
│   │   ├── context.ts          ← Request context builder (injects ctx.user)
│   │   ├── oauth.ts            ← Manus OAuth callback handler
│   │   ├── cookies.ts          ← JWT session cookie helpers
│   │   ├── env.ts              ← Typed environment variable accessors
│   │   ├── llm.ts              ← invokeLLM() helper
│   │   ├── notification.ts     ← notifyOwner() helper
│   │   ├── imageGeneration.ts  ← generateImage() helper
│   │   ├── voiceTranscription.ts ← transcribeAudio() helper
│   │   ├── storageProxy.ts     ← /manus-storage/* reverse proxy
│   │   ├── systemRouter.ts     ← system.notifyOwner tRPC procedure
│   │   ├── heartbeat.ts        ← Scheduled heartbeat runner
│   │   ├── map.ts              ← Google Maps proxy helper
│   │   ├── dataApi.ts          ← Manus Data API helper
│   │   └── vite.ts             ← Vite dev middleware bridge
│   ├── db.ts                   ← All database query helpers (single file)
│   ├── routers.ts              ← Root tRPC router, merges all sub-routers
│   ├── storage.ts              ← storagePut(), storageGet() S3 helpers
│   ├── lowStockCheck.ts        ← Hourly low-stock notification scheduler
│   ├── routers/
│   │   ├── animals.ts          ← animals.* procedures
│   │   ├── breeding.ts         ← breeding.* procedures
│   │   ├── config.ts           ← config.* procedures
│   │   ├── dashboard.ts        ← dashboard.*, notifications.*, sales.*, audit.*, userMgmt.*
│   │   ├── expenses.ts         ← expenses.* procedures
│   │   ├── feed.ts             ← feed.* procedures
│   │   └── softDelete.ts       ← recycleBin.* procedures
│   └── lfms.test.ts            ← Vitest unit tests (57 tests)
├── drizzle/
│   ├── schema.ts               ← All table definitions and TypeScript types
│   ├── relations.ts            ← Drizzle relation definitions
│   └── 0000_safe_clea.sql      ← Initial migration SQL
├── docs/
│   ├── SYSTEM_OVERVIEW.md      ← Business logic and feature documentation
│   └── CODE_WIKI.md            ← This file
└── todo.md                     ← Development task tracker
```

---

## 3. Database Schema

All tables are defined in `drizzle/schema.ts`. The database is MySQL (TiDB Cloud).

### 3.1 Configuration Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `species` | Animal species (Sheep, Goat, Cow, Dog) | `name`, `isActive` |
| `animal_categories` | Category within species (Fattening, Ewe, Ram) | `name`, `speciesId`, `idPrefix`, `idSequence`, `targetWeightKg`, `isExitStatus` |
| `animal_statuses` | Status values (Active, Dead, Sold) | `name`, `isExitStatus` |
| `groups` | Pen or management groups | `groupCode`, `name`, `speciesId`, `categoryId` |
| `birth_types` | Birth classification (Single, Twin, Triplet) | `name` |
| `feed_items` | Feed types (Alfalfa, Hay, Concentrate) | `name`, `unit` |
| `feed_item_price_history` | Historical prices per feed item | `feedItemId`, `effectiveDate`, `pricePerUnit` |
| `expense_categories` | Expense categories (Veterinary, Labour) | `name` |
| `expense_sub_categories` | Sub-categories under expense categories | `categoryId`, `name` |
| `system_settings` | Key-value configuration store | `settingKey`, `settingValue` |

### 3.2 Operational Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `animals` | Core animal registry | `animalId`, `speciesId`, `categoryId`, `groupId`, `statusId`, `sex`, `acquisitionType`, `acquisitionDate`, `purchaseCost`, `exitDate`, `isActive` |
| `animal_status_history` | Status change audit trail | `animalId`, `previousStatusId`, `newStatusId`, `changedAt` |
| `sales` | Sale records | `animalId`, `saleDate`, `salePrice`, `weightAtSale`, `pricePerKg`, `buyerName` |
| `lambing_log` | Birth records | `lambId`, `birthDate`, `damId`, `sireId`, `sex`, `birthTypeId`, `birthWeightKg`, `isPromoted`, `promotedHeadId` |
| `weight_log` | Weight measurements | `animalId`, `weighDate`, `weightKg`, `sessionId` |
| `ration_plans` | Feed ration plans per category | `categoryId`, `feedItemId`, `qtyPerHeadPerDay`, `effectiveDate`, `endDate`, `isActive` |
| `feed_stock_ledger` | Feed stock movements | `feedItemId`, `transactionDate`, `transactionType`, `qty`, `unitCost`, `totalCost`, `supplierName` |
| `expenses` | Farm expense records | `expenseDate`, `categoryId`, `subCategoryId`, `amount`, `targetType`, `categoryTarget`, `headId`, `vendorName` |

### 3.3 System Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `users` | Authenticated users | `openId`, `name`, `email`, `role` |
| `notifications` | In-app notifications | `alertType`, `title`, `message`, `priority`, `isRead` |
| `audit_log` | Action audit trail | `userId`, `action`, `entityType`, `entityId`, `oldValues`, `newValues` |

### 3.4 Soft Delete Pattern

All operational tables (and most configuration tables) include `deletedAt` (timestamp) and `deletedBy` (int FK to users) columns. All read queries filter `WHERE deletedAt IS NULL`. Soft-deleted records appear in the Recycle Bin and can be restored. Tenant-facing hard purge is intentionally unavailable; retention and deletion approval are handled by the platform lifecycle workflow.

---

## 4. Server — `server/db.ts`

This is the single source of truth for all database queries. Every function is `export async` and returns typed results. Routers import from this file; they never write raw SQL directly.

### 4.1 Configuration Helpers

| Function | Signature | Returns |
|---|---|---|
| `getAllSpecies()` | `()` | `Species[]` |
| `createSpecies(data)` | `({ name, description? })` | Insert result |
| `updateSpecies(id, data)` | `(number, Partial<{name, description, isActive}>)` | Update result |
| `getAllCategories(speciesId?)` | `(number?)` | `AnimalCategory[]` |
| `createCategory(data)` | `({ name, speciesId, idPrefix, ... })` | Insert result |
| `updateCategory(id, data)` | `(number, Partial<AnimalCategory>)` | Update result |
| `getAllStatuses()` | `()` | `AnimalStatus[]` |
| `createStatus(data)` | `({ name, isExitStatus?, ... })` | Insert result |
| `updateStatus(id, data)` | `(number, Partial<AnimalStatus>)` | Update result |
| `getAllGroups(speciesId?)` | `(number?)` | `Group[]` |
| `createGroup(data)` | `({ groupCode, name, ... })` | Insert result |
| `updateGroup(id, data)` | `(number, Partial<Group>)` | Update result |
| `getAllBirthTypes()` | `()` | `BirthType[]` |
| `createBirthType(data)` | `({ name, description? })` | Insert result |
| `updateBirthType(id, data)` | `(number, Partial<BirthType>)` | Update result |
| `getAllFeedItems()` | `()` | `FeedItem[]` |
| `createFeedItem(data)` | `({ name, unit? })` | Insert result |
| `updateFeedItem(id, data)` | `(number, Partial<FeedItem>)` | Update result |
| `getFeedItemPriceHistory(feedItemId)` | `(number)` | `FeedItemPriceHistory[]` |
| `addFeedItemPrice(data)` | `({ feedItemId, effectiveDate, pricePerUnit, notes? })` | Insert result |
| `getAllExpenseCategories()` | `()` | `ExpenseCategory[]` |
| `createExpenseCategory(data)` | `({ name, description? })` | Insert result |
| `updateExpenseCategory(id, data)` | `(number, Partial<...>)` | Update result |
| `getAllExpenseSubCategories(categoryId?)` | `(number?)` | `ExpenseSubCategory[]` |
| `createExpenseSubCategory(data)` | `({ categoryId, name, description? })` | Insert result |
| `updateExpenseSubCategory(id, data)` | `(number, Partial<...>)` | Update result |
| `getAllSettings()` | `()` | `SystemSetting[]` |
| `getSetting(key)` | `(string)` | `string \| null` |
| `upsertSetting(key, value, updatedBy?)` | `(string, string, number?)` | Upsert result |

### 4.2 Animal Helpers

| Function | Signature | Description |
|---|---|---|
| `getAnimals(filters?)` | `({ speciesId?, categoryId?, groupId?, statusId?, isActive?, search? })` | Returns animals with joined species, category, group, status names |
| `getAnimalById(id)` | `(number)` | Returns single animal with all joins, latest weight, and sale record |
| `createAnimal(data)` | `(typeof animals.$inferInsert)` | Inserts animal, increments category `idSequence` |
| `updateAnimal(id, data)` | `(number, Partial<...>)` | Updates animal fields |
| `getActiveHeadCountByCategory(dateStr?)` | `(string?)` | Returns `Record<categoryId, count>` for active animals |
| `getAnimalStatusHistory(animalId)` | `(number)` | Returns status change log for one animal |
| `recordStatusChange(data)` | `({ animalId, previousStatusId?, newStatusId, changedBy?, notes? })` | Inserts status history row |

### 4.3 Sales Helpers

| Function | Signature | Description |
|---|---|---|
| `getSales(filters?)` | `({ animalId?, fromDate?, toDate? })` | Returns sales with joined animal data |
| `createSale(data)` | `(typeof sales.$inferInsert)` | Inserts sale record |
| `updateSale(id, data)` | `(number, Partial<{salePrice, weightAtSale, saleDate, buyerName, notes}>)` | Updates sale fields |

### 4.4 Breeding Helpers

| Function | Signature | Description |
|---|---|---|
| `getLambingLog(filters?)` | `({ isPromoted? })` | Returns lambing records with dam/sire names |
| `createLambingRecord(data)` | `(typeof lambingLog.$inferInsert)` | Inserts birth record |
| `updateLambingRecord(id, data)` | `(number, Partial<...>)` | Updates birth record |

### 4.5 Weight Log Helpers

| Function | Signature | Description |
|---|---|---|
| `getWeightLog(animalId)` | `(number)` | Returns all weight entries for one animal, ordered by date desc |
| `createWeightEntry(data)` | `(typeof weightLog.$inferInsert)` | Inserts weight measurement |
| `getLatestWeightForAnimals(animalIds)` | `(number[])` | Bulk fetch of latest weight per animal |

### 4.6 Feed Helpers

| Function | Signature | Description |
|---|---|---|
| `getRationPlans(categoryId?)` | `(number?)` | Returns ration plans with feed item name, unit, and category name (flat structure) |
| `createRationPlan(data)` | `(typeof rationPlans.$inferInsert)` | Inserts ration plan |
| `updateRationPlan(id, data)` | `(number, Partial<...>)` | Updates ration plan fields |
| `getActivePlanOnDate(categoryId, dateStr)` | `(number, string)` | Returns all active ration plans for a category on a given date |
| `getFeedStockLedger(feedItemId?)` | `(number?)` | Returns stock ledger entries with feed item name |
| `createFeedStockEntry(data)` | `(typeof feedStockLedger.$inferInsert)` | Inserts stock movement |
| `updateFeedStockEntry(id, data)` | `(number, Partial<...>)` | Updates stock entry fields |
| `getFeedStockStatus()` | `()` | Returns stock-on-hand, daily consumption, days remaining, and status for all feed items |

### 4.7 Expense Helpers

| Function | Signature | Description |
|---|---|---|
| `getExpenses(filters?)` | `({ fromDate?, toDate?, categoryId?, targetType?, headId? })` | Returns expenses with category/sub-category names |
| `createExpense(data)` | `(typeof expenses.$inferInsert)` | Inserts expense record |
| `updateExpense(id, data)` | `(number, Partial<...>)` | Updates expense fields |
| `deleteExpense(id, deletedBy?)` | `(number, number?)` | Soft-deletes expense |

### 4.8 Notification Helpers

| Function | Signature | Description |
|---|---|---|
| `getNotifications(userId?, unreadOnly?)` | `(number?, boolean?)` | Returns notifications, newest first |
| `createNotification(data)` | `(typeof notifications.$inferInsert)` | Inserts notification |
| `markNotificationRead(id)` | `(number)` | Sets `isRead = true` |
| `markAllNotificationsRead(userId)` | `(number)` | Marks all user notifications as read |

### 4.9 Audit Helpers

| Function | Signature | Description |
|---|---|---|
| `createAuditEntry(data)` | `(typeof auditLog.$inferInsert)` | Inserts audit log row |
| `getAuditLog(entityType?, entityId?)` | `(string?, string?)` | Returns audit entries, newest first |

### 4.10 P&L Helpers

| Function | Signature | Description |
|---|---|---|
| `getAnimalPnL(animalId)` | `(number)` | Full P&L for one animal: purchaseCost, feedCost, directExpenseTotal, totalCost, revenue, netPnL, costPerDay, pricePerKg, projectedCost |
| `getAllAnimalsPnL(filters?)` | `({ speciesId?, categoryId? })` | Bulk P&L for all animals in a single pass using pre-fetched lookup tables |

### 4.11 Dashboard & Reporting Helpers

| Function | Signature | Description |
|---|---|---|
| `getDashboardKPIs(filters?)` | `({ fromDate?, toDate?, speciesId?, categoryId?, groupId? })` | Returns totalActiveHeads, totalExpenses, totalRevenue, grossPnL, categoryBreakdown |
| `getIncomeStatement(filters)` | `({ fromDate, toDate, speciesId?, categoryId? })` | Returns revenue, costs (animalPurchases, feedPurchases, byCategory), grossProfit, profitMargin |

---

## 5. tRPC Routers

All procedures are `protectedProcedure` (require authenticated session) unless noted. The root router is assembled in `server/routers.ts`.

### 5.1 `animals.*`  (`server/routers/animals.ts`)

| Procedure | Type | Input | Description |
|---|---|---|---|
| `animals.list` | query | `{ speciesId?, categoryId?, groupId?, statusId?, isActive?, search? }` | List animals with filters |
| `animals.getById` | query | `{ id: number }` | Get single animal with all detail |
| `animals.create` | mutation | Animal fields | Create animal, auto-assign ID |
| `animals.update` | mutation | `{ id, ...fields }` | Update animal fields |
| `animals.exit` | mutation | `{ id, statusId, exitDate?, exitReason?, notes? }` | Mark animal as exited |
| `animals.getStatusHistory` | query | `{ animalId }` | Status change log |
| `animals.getWeightLog` | query | `{ animalId }` | Weight history |
| `animals.addWeight` | mutation | `{ animalId, weighDate, weightKg, notes? }` | Record weight |
| `animals.getPnL` | query | `{ animalId }` | P&L for one animal |
| `animals.getAllPnL` | query | `{ speciesId?, categoryId? }` | Bulk P&L for all animals |
| `animals.getFeedHistory` | query | `{ animalId }` | Ration plans for animal's category |
| `animals.getExpenseHistory` | query | `{ animalId }` | Direct expenses for one animal |
| `animals.getAnimalSales` | query | `{ animalId }` | Sale record for one animal |
| `animals.getLineage` | query | `{ animalId }` | Dam and sire information |

### 5.2 `breeding.*`  (`server/routers/breeding.ts`)

| Procedure | Type | Input | Description |
|---|---|---|---|
| `breeding.listLambing` | query | `{ isPromoted? }` | List lambing records |
| `breeding.recordBirth` | mutation | Birth fields | Create lambing record |
| `breeding.promoteLamb` | mutation | `{ lambingLogId, categoryId, speciesId, groupId, statusId, acquisitionDate }` | Promote lamb to full animal |

### 5.3 `config.*`  (`server/routers/config.ts`)

All config procedures follow a `get*/create*/update*` pattern for each entity. The full list:

`getSpecies`, `createSpecies`, `updateSpecies`, `getCategories`, `createCategory`, `updateCategory`, `getStatuses`, `createStatus`, `updateStatus`, `getGroups`, `createGroup`, `updateGroup`, `getBirthTypes`, `createBirthType`, `updateBirthType`, `getFeedItems`, `createFeedItem`, `updateFeedItem`, `getFeedItemPriceHistory`, `addFeedItemPrice`, `getExpenseCategories`, `createExpenseCategory`, `updateExpenseCategory`, `getExpenseSubCategories`, `createExpenseSubCategory`, `updateExpenseSubCategory`, `getSettings`, `upsertSetting`, `getUsers`, `updateUserRole`.

### 5.4 `dashboard.*`  (`server/routers/dashboard.ts`)

| Procedure | Type | Input | Description |
|---|---|---|---|
| `dashboard.getKPIs` | query | `{ fromDate?, toDate?, speciesId?, categoryId?, groupId? }` | Dashboard KPI cards |
| `dashboard.getFeedStockStatus` | query | `{}` | Stock status for all feed items |
| `dashboard.getIncomeStatement` | query | `{ fromDate, toDate, speciesId?, categoryId? }` | Income statement |
| `dashboard.getExpenseTrend` | query | `{ fromDate?, toDate? }` | Monthly expense totals |
| `dashboard.getSalesTrend` | query | `{ fromDate?, toDate? }` | Monthly sales totals |
| `dashboard.getHeadCountByCategory` | query | `{}` | Head count grouped by category |

### 5.5 `expenses.*`  (`server/routers/expenses.ts`)

| Procedure | Type | Input | Description |
|---|---|---|---|
| `expenses.list` | query | `{ fromDate?, toDate?, categoryId?, targetType?, headId? }` | List expenses |
| `expenses.create` | mutation | Expense fields | Create expense + audit log |
| `expenses.update` | mutation | `{ id, ...fields }` | Update expense fields |
| `expenses.delete` | mutation | `{ id }` | Soft-delete expense |

### 5.6 `feed.*`  (`server/routers/feed.ts`)

| Procedure | Type | Input | Description |
|---|---|---|---|
| `feed.getRationPlans` | query | `{ categoryId? }` | List ration plans (flat structure) |
| `feed.createRationPlan` | mutation | Plan fields | Create ration plan + audit log |
| `feed.updateRationPlan` | mutation | `{ id, categoryId?, feedItemId?, qtyPerHeadPerDay?, effectiveDate?, endDate?, isActive? }` | Update ration plan |
| `feed.getStockLedger` | query | `{ feedItemId? }` | List stock ledger entries |
| `feed.addStockEntry` | mutation | Stock entry fields | Add stock movement + low-stock check |
| `feed.updateStockEntry` | mutation | `{ id, ...fields }` | Update stock entry |
| `feed.getStockStatus` | query | `{}` | Current stock status for all items |

### 5.7 `sales.*`  (`server/routers/dashboard.ts`)

| Procedure | Type | Input | Description |
|---|---|---|---|
| `sales.list` | query | `{ animalId?, fromDate?, toDate? }` | List sales with animal data |
| `sales.create` | mutation | Sale fields | Create sale + update animal status + audit log |
| `sales.update` | mutation | `{ id, salePrice?, weightAtSale?, saleDate?, buyerName?, notes? }` | Update sale |

### 5.8 `notifications.*`  (`server/routers/dashboard.ts`)

| Procedure | Type | Input | Description |
|---|---|---|---|
| `notifications.list` | query | `{ unreadOnly? }` | List notifications for current user |
| `notifications.markRead` | mutation | `{ id }` | Mark one notification as read |
| `notifications.markAllRead` | mutation | `{}` | Mark all notifications as read |
| `notifications.create` | mutation | Notification fields | Create notification |

### 5.9 `recycleBin.*`  (`server/routers/softDelete.ts`)

The Recycle Bin router handles soft-delete lifecycle for all entity types:

| Pattern | Description |
|---|---|
| `recycleBin.list` | Returns all soft-deleted records across all entity types |
| `recycleBin.delete{Entity}` | Soft-deletes a record (sets `deletedAt`, `deletedBy`) |
| `recycleBin.restore{Entity}` | Restores a soft-deleted record (clears `deletedAt`, `deletedBy`) |

Entities supported: `Animal`, `Expense`, `WeightLog`, `LambingLog`, `RationPlan`, `FeedStock`, `Sale`, `Species`, `Category`, `Group`, `Status`, `BirthType`, `FeedItem`, `ExpenseCategory`.

### 5.10 `auth.*`  (built-in, `server/_core`)

| Procedure | Type | Description |
|---|---|---|
| `auth.me` | query | Returns current user or null |
| `auth.logout` | mutation | Clears session cookie |

### 5.11 `system.*`  (`server/_core/systemRouter.ts`)

| Procedure | Type | Description |
|---|---|---|
| `system.notifyOwner` | mutation | Sends a push notification to the farm owner |

---

## 6. Frontend Pages

### 6.1 Routing (`client/src/App.tsx`)

All routes are wrapped in `DashboardLayout` which enforces authentication. Unauthenticated users are redirected to `Home.tsx` (the login page).

| Route | Page Component | Description |
|---|---|---|
| `/` | `Home.tsx` | Login landing (public) |
| `/dashboard` | `Dashboard.tsx` | KPI dashboard |
| `/animals` | `Animals.tsx` | Animal registry |
| `/animals/:id` | `AnimalProfile.tsx` | Per-animal detail |
| `/breeding` | `Breeding.tsx` | Lambing log |
| `/fattening` | `Fattening.tsx` | Fattening tracker |
| `/feed` | `Feed.tsx` | Feed management |
| `/expenses` | `Expenses.tsx` | Expense log |
| `/sales` | `Sales.tsx` | Sales records |
| `/pnl` | `PnL.tsx` | Animal P&L |
| `/income-statement` | `IncomeStatement.tsx` | Income statement |
| `/config` | `Configuration.tsx` | Reference data |
| `/notifications` | `Notifications.tsx` | Notification centre |
| `/audit` | `AuditLog.tsx` | Audit trail |
| `/recycle-bin` | `RecycleBin.tsx` | Soft-deleted records |
| `/users` | `UserManagement.tsx` | User roles |

### 6.2 `DashboardLayout.tsx`

The main layout shell. Renders the sidebar navigation, user profile footer, language switcher, and theme toggle. Calls `trpc.auth.me.useQuery()` on mount; if the user is not authenticated, redirects to the login page. The sidebar highlights the active route using wouter's `useLocation()`.

### 6.3 `AnimalProfile.tsx`

A multi-tab detail page for a single animal. Tabs:

| Tab | Data Source | Description |
|---|---|---|
| Overview | `animals.getById` | Basic fields, status, group, acquisition info |
| Feed | `animals.getFeedHistory` | Ration plans for the animal's category |
| Weight | `animals.getWeightLog` | Weight history chart and table |
| P&L | `animals.getPnL` | Cost breakdown, revenue, net P&L |
| Breeding | `animals.getLineage` | Dam, sire, offspring |

### 6.4 `Feed.tsx`

Two-tab page:

- **Stock Ledger tab** — Table of all stock movements with Edit (pencil) and Delete (trash) per row. Edit opens `EditStockDialog` pre-filled with the entry's current values.
- **Ration Plans tab** — Table of all ration plans with Edit (pencil) and Delete (trash) per row. Edit opens `EditRationPlanDialog`.

The top section shows stock status cards (one per feed item) with current stock, days remaining, and status badge. Cards use skeleton loading while data fetches.

### 6.5 `PnL.tsx`

Displays a table of all animals with their full P&L breakdown. Columns: Animal ID, Species, Category, Status, Days on Farm, Purchase Cost, Feed Cost, Direct Expenses, Total Cost, Revenue, Net P&L, Cost/Day. Filters: species, category, status name. Summary cards show total realised revenue, total running cost (active animals), and total realised net P&L (closed animals only).

### 6.6 `IncomeStatement.tsx`

Period-based income statement with date range pickers. Sections: Revenue (Animal Sales), Expenses (Animal Purchases, Feed Stock Purchases, by expense category), and Summary (Gross Profit, Profit Margin). Includes a PDF export button using `jsPDF` + `jspdf-autotable`.

---

## 7. Key Services

### 7.1 `server/lowStockCheck.ts`

Runs on server startup and every 3,600,000 ms (1 hour). For each feed item in `critical` or `low` status, checks whether an unread `low_feed_stock` notification already exists in the last 24 hours. If not, creates a new notification with the appropriate priority (`critical` or `medium`).

```typescript
// Entry point called from server/_core/index.ts
export function startLowStockScheduler(): void
```

### 7.2 `server/storage.ts`

Wraps the Manus S3 storage API.

```typescript
storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType?: string): Promise<{ key: string; url: string }>
storageGet(relKey: string, expiresIn?: number): Promise<{ key: string; url: string }>
```

### 7.3 `server/_core/notification.ts`

```typescript
notifyOwner({ title: string; content: string }): Promise<boolean>
```

Sends a push notification to the farm owner via the Manus notification API. Returns `true` on success, `false` on failure.

---

## 8. Authentication Flow

1. User clicks "Login with Manus" on `Home.tsx`. The `getLoginUrl(returnPath?)` function in `client/src/const.ts` constructs the OAuth URL, encoding `window.location.origin` and the return path in the `state` parameter.
2. After Manus OAuth completes, the browser is redirected to `/api/oauth/callback`.
3. `server/_core/oauth.ts` validates the code, fetches the user profile, upserts the user in the `users` table, and sets a signed JWT session cookie.
4. The `parseState()` function extracts the original `origin` from the state and redirects back to the frontend.
5. Every subsequent request to `/api/trpc` passes through `server/_core/context.ts`, which reads the JWT cookie and injects `ctx.user` into the tRPC context.
6. `protectedProcedure` throws `UNAUTHORIZED` if `ctx.user` is null.

---

## 9. Testing

Tests are in `server/lfms.test.ts` (57 tests) and `server/auth.logout.test.ts` (1 test). Run with:

```bash
pnpm test
```

The test file uses Vitest with `vi.mock` to mock `server/db.ts`. Each router is tested by calling its tRPC procedure directly with a mock context. Tests cover:

- All CRUD operations for animals, expenses, sales, feed, and ration plans
- Soft-delete and restore flows
- P&L calculation (single animal and bulk)
- Notification creation and deduplication
- Auth logout

---

## 10. Development Workflow

```bash
# Install dependencies
pnpm install

# Start dev server (port 3000)
pnpm dev

# Type check
npx tsc --noEmit

# Run tests
pnpm test

# Generate Drizzle migration SQL after schema changes
pnpm drizzle-kit generate

# Apply migration (paste SQL into webdev_execute_sql tool)
```

### 10.1 Adding a New Feature

1. Add or update table(s) in `drizzle/schema.ts`.
2. Run `pnpm drizzle-kit generate` to produce migration SQL.
3. Apply the SQL via `webdev_execute_sql`.
4. Add query helpers to `server/db.ts`.
5. Add tRPC procedures to the appropriate `server/routers/*.ts` file.
6. Build the frontend page in `client/src/pages/`.
7. Register the route in `client/src/App.tsx`.
8. Add tests to `server/lfms.test.ts`.
9. Run `npx tsc --noEmit` and `pnpm test` to verify.
10. Save checkpoint with `webdev_save_checkpoint`.

---

## 11. Environment Variables

All environment variables are injected by the Manus platform. They are accessed via `server/_core/env.ts`.

| Variable | Used By | Description |
|---|---|---|
| `DATABASE_URL` | `server/db.ts` | MySQL/TiDB connection string |
| `JWT_SECRET` | `server/_core/cookies.ts` | Session cookie signing secret |
| `VITE_APP_ID` | `client/src/const.ts` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | `server/_core/oauth.ts` | Manus OAuth backend URL |
| `VITE_OAUTH_PORTAL_URL` | `client/src/const.ts` | Manus login portal URL |
| `OWNER_OPEN_ID` | `server/_core/oauth.ts` | Owner's Manus open ID (for role assignment) |
| `OWNER_NAME` | `server/_core/oauth.ts` | Owner's display name |
| `BUILT_IN_FORGE_API_URL` | `server/_core/llm.ts`, etc. | Manus built-in API base URL (server) |
| `BUILT_IN_FORGE_API_KEY` | `server/_core/llm.ts`, etc. | Bearer token for built-in APIs (server) |
| `VITE_FRONTEND_FORGE_API_URL` | Frontend | Manus built-in API URL (client) |
