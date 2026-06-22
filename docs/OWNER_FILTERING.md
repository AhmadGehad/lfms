# Owner Filtering — Business Rules & Equations

> Feature: a single, global **Owner filter** that scopes every page to one
> owner. When an owner is selected, all data and numbers reflect only that
> owner's animals; farm‑wide costs that cannot be attributed to an owner
> (general overhead such as electricity, herd‑wide expenses, and bulk feed
> purchases) are excluded.

---

## 1. Why this exists

The farm holds animals belonging to several **owners** (`owners` table, linked
from `animals.ownerId`). Owners want to see *their* numbers in isolation:
"How many head do I have? What did they cost? What did they earn? What is my
running cost per month?" — without farm overhead that isn't theirs (e.g. the
electricity bill) polluting the figures.

## 2. The control

- A **global owner selector** lives in the top bar and is visible on **every
  page**. It is backed by `OwnerFilterContext` and persisted in
  `localStorage` (`lfms-owner-filter`), so the chosen owner survives navigation
  and reloads.
- Default value is **All Owners** (`ownerId = null`) → the whole‑farm view,
  identical to the system's previous behaviour.
- The selector only appears for users who can view at least one owner‑scoped
  page (mirrors the server's `OWNER_VIEW_PERMISSIONS`).

## 3. The core attribution rule

Every figure is classified as **owner‑attributable** or **farm‑wide**.

| Data / cost | Attributable to owner via | Behaviour under owner scope |
|---|---|---|
| Animals, head count, average head | `animals.ownerId` | Only the owner's animals |
| Sales revenue / receivables | `sales.animalId → animals.ownerId` | Only sales of the owner's animals |
| Animal purchase cost | `animals.ownerId` | Only the owner's animals |
| **Head** expenses (`targetType = 'head'`) | `expenses.headId → animals.ownerId` | Included if the head is the owner's |
| **Category** expenses (`targetType = 'category'`) | `expenses.categoryTarget` ∈ owner's categories | Included if the owner has ≥1 animal in that category |
| **General** expenses (`targetType = 'general'`, e.g. electricity) | — (farm‑wide) | **Excluded** |
| **Herd** expenses (`targetType = 'herd'`) | — (farm‑wide) | **Excluded** |
| **Feed purchases** (`feed_stock_ledger`) | — (not tagged by owner) | **Excluded**; replaced by modelled consumption (see §4) |
| Feed **stock** levels (Feed page) | — (farm‑wide inventory) | Shown as‑is (inventory is physical, not per‑owner) |
| Vaccination records | `vaccination_records.animalId → animals.ownerId` | Only the owner's animals |
| Lambing / breeding records | dam → `animals.ownerId` | Lambs attributed to the dam's owner |
| Fattening (weight log) | `animals.ownerId` | Only the owner's animals |

> **The electricity rule, precisely:** an expense is "related to" an owner only
> when it is a **head** expense on one of their animals, or a **category**
> expense for a category in which they hold at least one animal. `general` and
> `herd` expenses are farm‑wide and are dropped entirely from owner‑scoped
> figures.

## 4. Feed under owner scope (the key modelling decision)

Bulk feed is bought farm‑wide and recorded in `feed_stock_ledger` with **no
owner tag**. Two options were considered:

1. Show feed = 0 for an owner (the previous Income‑Statement behaviour).
   → Rejected: it understates the owner's true cost and contradicts "all numbers
   related to the owner."
2. **Model feed on a consumption basis** for the owner's animals.
   → **Chosen.**

For each of the owner's animals we apply its **category ration plan × the feed
price in force**, over the days the animal was on the farm within the reporting
period. This reuses the exact per‑animal feed maths the P&L already uses
(`segmentedFeedCostPure`), so an owner's feed number always reconciles with the
sum of their animals' P&L rows.

```
ownerFeedCost(owner, from, to)
  = Σ over owner's animals a:
        segmentedFeedCost( a.category,
                           start = max(a.acquisitionDate, from),
                           end   = min(a.exitDate ?? to, to) )

segmentedFeedCost(category, start, end)
  = Σ over day‑segments s in [start, end):
        Σ over active ration plan lines l in category during s:
            qtyPerHeadPerDay(l) × days(s) × feedPrice(l.feedItem, s.start)
```

- **Whole‑farm** feed remains **purchase‑based** (cash basis) from the ledger.
- **Owner‑scoped** feed is **consumption‑based** (accrual basis).
- These two bases answer different questions and are intentionally different;
  they are not expected to tie out to each other.

## 5. Equations by page

Notation: all money is computed in integer **minor units** (piastres) and
converted to major units (EGP) at the end. `Σ_owner` means "summed over rows
that satisfy the owner‑attribution rule in §3".

### 5.1 Dashboard KPIs (`getDashboardKPIs`)

```
activeHeads        = COUNT(animals where isActive, [owner])
averageHeads       = totalHeadDays / periodDays
totalHeadDays      = Σ_owner overlapDays(animal, [from,to])

otherExpenses      = Σ_owner expense.amount            -- head + category only when scoped
feedExpenses       = ownerScoped ? ownerFeedCost(owner, from, to)
                                  : Σ feedPurchases(from, to)
totalExpenses      = otherExpenses + feedExpenses

totalRevenue       = Σ_owner sales.salePrice
cashReceived       = Σ_owner sales.amountPaid
outstanding        = totalRevenue − cashReceived

grossPnL           = totalRevenue − totalExpenses
costPerHeadPerDay  = totalExpenses / totalHeadDays
```

Category breakdown, expense trend and sales trend charts use the same
owner‑attribution filters.

### 5.2 Income Statement (`getIncomeStatement`)

```
revenue.total      = Σ_owner sales.salePrice
costs.animalPurch. = Σ_owner animals.purchaseCost  (acquired in period)
costs.byCategory   = Σ_owner expense.amount grouped by expense category
costs.feed         = ownerScoped ? ownerFeedCost(owner, from, to)
                                  : Σ feedPurchases(from, to)
costs.total        = animalPurchases + feed + Σ byCategory
grossProfit        = revenue.total − costs.total
profitMargin       = grossProfit / revenue.total

runningCostPerMonth:
  farmWide   = ownerScoped ? 0 : Σ general expenses               -- per month
  animalWide = feed + head + category + herd(=0 when scoped)      -- per month
  total      = farmWide + animalWide
  (period operating total ÷ months, months = periodDays / 30.4375)
```

> Under owner scope `farmWide` running cost is **0** by definition — overhead is
> not the owner's — and `herd` contributes 0 because herd expenses are excluded.

### 5.3 P&L per animal (`getAllAnimalsPnL`)

Unchanged maths; the owner filter simply restricts the animal set. Per animal:

```
operatingCost = feedCost + directExpense + categoryAllocation + herdAllocation
totalCost     = purchaseCost + operatingCost
netPnL        = revenue − totalCost
```

The **Farm operating cost** card (general/overhead total) is **hidden** when an
owner is selected, since that overhead is not attributable to one owner.

### 5.4 Operational pages

- **Fattening** — animal list filtered by `animals.ownerId`.
- **Vaccinations** — records filtered by `record.animal.ownerId`.
- **Breeding** — lambing rows filtered by the **dam's** owner.
- **Feed** — stock levels are physical farm inventory and remain farm‑wide; the
  owner filter does not subset them.

## 6. Worked example

Farm has 10 head; Owner A owns 4 of them. In June:

- Electricity (general): EGP 2,000 → **excluded** for Owner A.
- Vet visit billed to Owner A's animal #A‑12 (head): EGP 500 → **included**.
- Category "Fattening" dewormer (category): EGP 1,000, Owner A has 4 of 8 head
  in that category → P&L allocates each head its share; the Income Statement /
  Dashboard count the **full** category expense once it matches the owner's
  category (attribution test is "owner has an animal in the category").
- Feed: no per‑owner purchase exists; Owner A's 4 animals' ration plans over
  June model EGP 3,200 of consumption → **that** is Owner A's feed cost.
- Owner A sold animal #A‑09 for EGP 9,000 → revenue 9,000.

Owner A's June numbers exclude the 2,000 electricity entirely, and feed shows
3,200 (modelled), not a slice of the farm's bulk feed invoices.

## 7. Implementation map

| Layer | File | Change |
|---|---|---|
| Feed model | `server/db.ts` → `getOwnerFeedCostMinor` | New consumption‑based owner feed cost |
| Dashboard | `server/db.ts` → `getDashboardKPIs` | `ownerId` scoping for heads, expenses, feed, revenue |
| Income Statement | `server/db.ts` → `getIncomeStatement` | Owner feed now modelled instead of 0 |
| Operational | `server/db.ts` → `getVaccinationRecords`, `getLambingLog` | `ownerId` filter |
| Routers | `server/routers/{dashboard,animals,vaccination,breeding}.ts` | Accept `ownerId` |
| Global filter | `client/src/contexts/OwnerFilterContext.tsx` | Persisted owner selection |
| Control | `client/src/components/OwnerFilterSelect.tsx` + `DashboardLayout.tsx` | Owner selector on every page |
| Pages | Dashboard, Animals, PnL, IncomeStatement, Expenses, Sales, Fattening, Breeding, AnimalVaccinations | Read global owner, drop redundant local owner dropdowns |
