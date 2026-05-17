# Livestock Farm Management System — System Overview

**Project:** Azal Farms (مزارع أزل)
**Version:** 9bcac83c
**Stack:** React 19 · Tailwind 4 · Express 4 · tRPC 11 · MySQL (TiDB) · Drizzle ORM
**Last Updated:** May 2026

---

## 1. Purpose

The Livestock Farm Management System (LFMS) is a full-stack web application designed to manage all operational and financial aspects of a mixed-species livestock farm. It tracks every animal from acquisition or birth through to sale or exit, records feed consumption and stock levels, logs all farm expenses, and produces per-animal and farm-level profit & loss reports.

The system is built for a single farm owner with multiple staff roles. All data is stored in a relational database, all business logic runs server-side via tRPC procedures, and the frontend is a React single-page application served from the same Node.js process.

---

## 2. User Roles

The system supports five roles, defined in the `users.role` enum:

| Role | Access Level |
|---|---|
| `owner` | Full access to all features, user management, configuration |
| `admin` | Full access equivalent to owner (system-level) |
| `supervisor` | Full operational access; cannot manage users |
| `staff` | Read/write access to daily operations (animals, feed, expenses) |
| `user` | Default role assigned on first login; limited access |

Role is assigned via the User Management page. The `owner` role is set automatically for the account whose `openId` matches the `OWNER_OPEN_ID` environment variable.

---

## 3. Module Overview

The system is divided into nine operational modules, each corresponding to a sidebar navigation entry and a set of backend procedures.

| Module | Sidebar Label | Primary Entities |
|---|---|---|
| Dashboard | Dashboard | KPI cards, charts, low-stock alerts |
| Animal Registry | Animal Registry | `animals`, `animal_status_history` |
| Breeding & Lambing | Breeding & Lambing | `lambing_log` |
| Fattening Tracker | Fattening Tracker | `animals` (Fattening category), `weight_log` |
| Feed Management | Feed Management | `feed_items`, `ration_plans`, `feed_stock_ledger` |
| Expense Log | Expense Log | `expenses`, `expense_categories` |
| Sales Records | Sales Records | `sales` |
| Animal P&L | Animal P&L | Derived from all of the above |
| Income Statement | Income Statement | Derived from all of the above |

Supporting modules include Configuration, Notifications, Audit Log, Recycle Bin, and User Management.

---

## 4. Animal Registry

### 4.1 Animal Identification

Every animal receives a unique ID generated from the category's `idPrefix` and an auto-incrementing `idSequence`. For example, the Fattening category uses prefix `F`, so animals are `F-001`, `F-002`, etc. The sequence is stored on the `animal_categories` table and incremented atomically on each `createAnimal` call.

### 4.2 Animal Fields

| Field | Type | Description |
|---|---|---|
| `animalId` | `varchar(20)` | Human-readable ID (e.g., `F-009`) |
| `speciesId` | FK → `species` | Sheep, Goat, Cow, Dog, etc. |
| `categoryId` | FK → `animal_categories` | Fattening, Ewe, Ram, Baby Goat, etc. |
| `groupId` | FK → `groups` | Pen or management group |
| `statusId` | FK → `animal_statuses` | Active, Dead, Sold, Ill/Slaughter, etc. |
| `sex` | enum | `male` or `female` |
| `acquisitionType` | enum | `purchased` or `born` |
| `acquisitionDate` | `date` | Date entered the farm |
| `birthDate` | `date` | Date of birth (same as acquisitionDate for purchased animals unless known) |
| `purchaseCost` | `decimal(10,2)` | Purchase price in EGP (0 for born animals) |
| `weightAtAcquisition` | `decimal(8,2)` | Weight in kg at time of entry |
| `exitDate` | `date` | Date of sale, death, or slaughter |
| `exitReason` | `text` | Free-text exit reason |
| `isActive` | `boolean` | `true` while on farm, `false` after exit |

### 4.3 Status Management

Animal statuses are fully configurable. The `isExitStatus` flag on `animal_statuses` marks statuses that trigger `isActive = false` and set `exitDate`. When an animal's status is changed to an exit status, the system automatically records a row in `animal_status_history` and sets `exitDate = today`.

### 4.4 Days on Farm Calculation

```
daysOnFarm = (exitDate ?? today) − acquisitionDate   [in days]
```

This value is used in feed cost calculations and displayed on the Fattening Tracker.

---

## 5. Breeding & Lambing

### 5.1 Lambing Log

Birth records are stored in `lambing_log`. Each record has a temporary `lambId` (e.g., `L-001`) and is linked to a dam (mother) and optionally a sire (father) from the `animals` table.

### 5.2 Lamb Promotion

A lamb in the lambing log is not yet a full animal record. Once the lamb is old enough to be assigned to a category, the user promotes it via the **Promote** action. Promotion creates a new row in `animals` with `acquisitionType = "born"`, assigns a permanent animal ID, and sets `lambingLog.isPromoted = true` and `lambingLog.promotedHeadId = animals.id`.

---

## 6. Fattening Tracker

The Fattening Tracker is a filtered view of the Animal Registry showing only animals in the **Fattening** category. It adds weight management functionality on top of the standard animal list.

### 6.1 Weight Log

Weight entries are stored in `weight_log`. Each entry records the animal ID, date, and weight in kg. The tracker displays the most recent weight for each animal.

### 6.2 Progress Calculation

```
currentWeight   = latest weight_log entry (or weightAtAcquisition if none)
targetWeight    = animal_categories.targetWeightKg
weightGain      = currentWeight − weightAtAcquisition
progressPct     = (weightGain / (targetWeight − weightAtAcquisition)) × 100
```

### 6.3 Daily Weight Gain

```
dailyGain = weightGain / daysOnFarm   [kg/day]
```

---

## 7. Feed Management

### 7.1 Feed Items

Feed items (Alfalfa, Hay, Concentrate 16%, etc.) are configured in the `feed_items` table. Each item has a unit (default: `kg`) and a price history stored in `feed_item_price_history`.

### 7.2 Ration Plans

A ration plan defines how much of a specific feed item one animal in a given category consumes per day. Plans have an effective date and an optional end date, allowing the farm to change rations over time.

| Field | Description |
|---|---|
| `categoryId` | Which animal category this plan applies to |
| `feedItemId` | Which feed item |
| `qtyPerHeadPerDay` | Kilograms per head per day (decimal, 3 decimal places) |
| `effectiveDate` | Date from which this plan is active |
| `endDate` | Date after which this plan expires (null = ongoing) |

**Current ration plans (as of May 2026):**

| Category | Feed Item | Qty/Head/Day |
|---|---|---|
| Fattening | Alfalfa Hay | 0.750 kg |
| Fattening | Hay | 0.500 kg |
| Fattening | Concentrate 16% | 1.000 kg |
| Ewe | Alfalfa Hay | 0.750 kg |
| Ewe | Hay | 0.500 kg |
| Ewe | Milking Concentrate | 0.300 kg |
| Ram | Alfalfa Hay | 0.750 kg |
| Ram | Hay | 0.500 kg |
| Ram | Concentrate 14% | 0.350 kg |
| Baby Goat | Alfalfa | 0.400 kg |

### 7.3 Feed Stock Ledger

All feed movements are recorded in `feed_stock_ledger`. Three transaction types are supported:

| Type | Description |
|---|---|
| `purchase` | New feed purchased and added to stock |
| `stock_count` | Physical count that resets the running balance |
| `adjustment` | Manual correction (positive or negative) |

### 7.4 Stock on Hand Calculation

```
stockOnHand = lastStockCountQty + SUM(purchases since lastStockCount)
```

The system uses the most recent `stock_count` entry as the baseline and adds all `purchase` entries after that date.

### 7.5 Days Remaining Calculation

```
dailyConsumption = SUM over all active ration plans of:
    qtyPerHeadPerDay × activeHeadCount[categoryId]

daysRemaining = floor(stockOnHand / dailyConsumption)
runOutDate    = today + daysRemaining days
```

**Stock status thresholds:**

| Status | Condition |
|---|---|
| `critical` | daysRemaining ≤ 3 |
| `low` | daysRemaining ≤ 7 |
| `ok` | daysRemaining > 7 |

### 7.6 Low Stock Notifications

A background scheduler (`server/lowStockCheck.ts`) runs on server startup and every hour. For each feed item in `critical` or `low` status, it creates a notification in the `notifications` table. Deduplication prevents repeat alerts: if an unread notification for the same feed item already exists within the last 24 hours, no new notification is created.

---

## 8. Expense Log

### 8.1 Expense Fields

| Field | Description |
|---|---|
| `expenseDate` | Date of expense |
| `categoryId` | Expense category (Veterinary, Feed, Labour, etc.) |
| `subCategoryId` | Optional sub-category |
| `amount` | Amount in EGP |
| `targetType` | `general`, `category`, or `head` |
| `categoryTarget` | Animal category ID (when targetType = `category`) |
| `headId` | Animal ID (when targetType = `head`) |
| `vendorName` | Supplier or vendor name |
| `notes` | Free-text notes |

### 8.2 Expense Allocation

The `targetType` field controls how an expense is attributed in P&L calculations:

- **`general`** — Farm-wide overhead; not allocated to any specific animal in per-animal P&L.
- **`category`** — Allocated to a specific animal category (e.g., a vet bill for all Fattening animals).
- **`head`** — Allocated directly to a single animal; appears in that animal's `directExpenseTotal` in P&L.

---

## 9. Sales Records

Each sale record links one animal to a sale event. An animal can only have one sale record (enforced by the UI). Recording a sale also updates the animal's status to the configured "Sold" status and sets `exitDate`.

| Field | Description |
|---|---|
| `saleDate` | Date of sale |
| `salePrice` | Total sale price in EGP |
| `weightAtSale` | Weight at time of sale in kg |
| `pricePerKg` | Derived: `salePrice / weightAtSale` |
| `buyerName` | Buyer name |

---

## 10. Animal P&L Calculation

The per-animal profit and loss calculation is performed by `getAnimalPnL()` (single animal) and `getAllAnimalsPnL()` (bulk, for the P&L page).

### 10.1 Cost Components

```
purchaseCost      = animals.purchaseCost

feedCost          = SUM over active ration plans on acquisitionDate of:
                    qtyPerHeadPerDay × daysOnFarm × feedPriceOnAcquisitionDate

directExpenseTotal = SUM of expenses WHERE targetType = 'head' AND headId = animalId

totalCost         = purchaseCost + feedCost + directExpenseTotal
```

### 10.2 Revenue and Net P&L

```
revenue   = sales.salePrice  (0 if animal not yet sold)
netPnL    = revenue − totalCost
costPerDay = totalCost / daysOnFarm
pricePerKg = revenue / weightAtSale  (if weightAtSale > 0)
```

### 10.3 Active vs. Closed Animals

Active animals (not yet sold or exited) show `revenue = 0` and a running `totalCost`. The P&L page displays these animals with a neutral "Ongoing" indicator rather than a red loss figure, because the cost is still accumulating and no revenue has been realised yet.

Closed animals (sold, dead, slaughtered) show the final `netPnL` with green (profit) or red (loss) colouring.

### 10.4 Feed Price Lookup

The `getFeedPriceOnDate()` helper finds the most recent `feed_item_price_history` entry on or before the given date. If no price history exists, it falls back to 0.

---

## 11. Income Statement

The Income Statement is a period-based financial summary produced by `getIncomeStatement()`.

### 11.1 Revenue

```
totalRevenue = SUM(sales.salePrice) WHERE saleDate IN [fromDate, toDate]
```

### 11.2 Cost Breakdown

```
animalPurchases = SUM(animals.purchaseCost) WHERE acquisitionDate IN [fromDate, toDate]
feedPurchases   = SUM(feed_stock_ledger.totalCost) WHERE transactionType = 'purchase'
                  AND transactionDate IN [fromDate, toDate]
byCategory      = SUM(expenses.amount) GROUP BY expenseCategories.name
                  WHERE expenseDate IN [fromDate, toDate]
totalCost       = animalPurchases + feedPurchases + SUM(byCategory)
```

### 11.3 Summary

```
grossProfit   = totalRevenue − totalCost
profitMargin  = (grossProfit / totalRevenue) × 100  (0 if totalRevenue = 0)
```

---

## 12. Dashboard KPIs

The Dashboard fetches `getDashboardKPIs()` which returns:

| KPI | Calculation |
|---|---|
| Active Animals | `COUNT(animals) WHERE isActive = true` |
| Total Revenue | `SUM(sales.salePrice)` in period |
| Total Expenses | `SUM(expenses.amount)` in period |
| Net P&L | `totalRevenue − totalExpenses` |
| Head Count by Category | `COUNT(animals) GROUP BY categoryId WHERE isActive = true` |

The default period is the last 12 months. Users can filter by species, category, and group.

---

## 13. Notifications

Notifications are stored in the `notifications` table and displayed in the sidebar bell icon with an unread count badge.

| Field | Description |
|---|---|
| `alertType` | `low_feed_stock`, `owner_notification`, or custom |
| `priority` | `low`, `medium`, `high`, `critical` |
| `isRead` | `false` until user marks as read |
| `relatedEntityType` | e.g., `feed_item` |
| `relatedEntityId` | ID of the related entity |

---

## 14. Audit Log

Every create, update, and delete operation on core entities records a row in `audit_log` with:

- `userId` — who performed the action
- `action` — `create`, `update`, `delete`, `restore`
- `entityType` — `animal`, `expense`, `sale`, `rationPlan`, `feedStock`, etc.
- `entityId` — the affected record's ID
- `oldValues` / `newValues` — JSON snapshots of changed fields

---

## 15. Soft Delete & Recycle Bin

All deletions are soft deletes: the record's `deletedAt` and `deletedBy` fields are set, and `isActive` is set to `false` where applicable. Records do not appear in normal queries (which filter `WHERE deletedAt IS NULL`).

The Recycle Bin page lists all soft-deleted records across entity types. Each record can be:

- **Restored** — `deletedAt` and `deletedBy` are cleared, `isActive` is reset to `true`.
- **Purged** — permanently deleted from the database (irreversible).
- **Purge All** — permanently deletes all soft-deleted records at once.

---

## 16. Configuration

All reference data is managed through the Configuration page. Configurable entities include:

| Entity | Key Fields |
|---|---|
| Species | name, description |
| Animal Categories | name, speciesId, idPrefix, targetWeightKg, expectedCycleDays, isExitStatus |
| Animal Statuses | name, isExitStatus |
| Groups | groupCode, name, speciesId, categoryId |
| Birth Types | name |
| Feed Items | name, unit |
| Feed Item Prices | feedItemId, effectiveDate, pricePerUnit |
| Expense Categories | name |
| Expense Sub-categories | categoryId, name |
| System Settings | key-value pairs |

---

## 17. Internationalisation

The frontend uses `react-i18next` for internationalisation. An Arabic (`ar`) locale is included. Users can toggle between English and Arabic using the language switcher in the sidebar footer. The layout direction switches to RTL automatically when Arabic is selected.

---

## 18. Data Integrity Rules

The following rules are enforced at the application layer:

1. An animal's `animalId` is unique and immutable after creation.
2. An animal can only have one sale record.
3. Changing an animal's status to an exit status automatically sets `isActive = false` and `exitDate = today`.
4. Feed stock entries with `transactionType = stock_count` reset the running balance baseline.
5. Ration plan quantities must be positive decimals.
6. All monetary values are stored as `decimal(10,2)` in EGP.
7. All timestamps are stored as UTC; the frontend converts to local time for display.
