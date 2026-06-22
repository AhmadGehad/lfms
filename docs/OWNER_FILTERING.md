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
| **Head** expenses (`targetType = 'head'`) | `expenses.headId → animals.ownerId` | Counted **in full** when the head is the owner's |
| **Category** expenses (`targetType = 'category'`) | allocated by head count | Owner's **share** = amount × ownerHeadsInCat(date) ÷ totalHeadsInCat(date) |
| **Herd** expenses (`targetType = 'herd'`) | allocated by head count | Owner's **share** = amount × ownerHeadsAlive(date) ÷ totalHeadsAlive(date) |
| **General** expenses (`targetType = 'general'`, e.g. electricity) | — (farm‑wide overhead) | **Excluded** |
| **Feed purchases** (`feed_stock_ledger`) | — (not tagged by owner) | **Excluded**; replaced by modelled consumption (see §4) |
| Feed **stock** levels (Feed page) | — (farm‑wide inventory) | Shown as‑is (inventory is physical, not per‑owner) |
| Vaccination records | `vaccination_records.animalId → animals.ownerId` | Only the owner's animals |
| Lambing / breeding records | dam → `animals.ownerId` | Lambs attributed to the dam's owner |
| Fattening (weight log) | `animals.ownerId` | Only the owner's animals |

> **The electricity rule, precisely:** only `general` overhead (electricity,
> rent, etc.) is *farm‑wide* and dropped from owner figures. `head` expenses on
> the owner's animals are charged in full; `category` and `herd` expenses are
> **allocated to the owner's share** by the number of their animals present on
> the expense date — exactly how the per‑animal P&L allocates them, so the
> Dashboard, Income Statement and P&L always reconcile. (Earlier drafts counted
> category expenses in full and dropped herd; this allocation supersedes that.)

The shared allocator is `allocateOwnerExpensesPure` (pure, unit‑tested in
`server/ownerExpenseAllocation.test.ts`), wrapped for the DB by
`getOwnerExpenseBreakdownMinor(ownerId, from, to)`.

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

otherExpenses      = ownerScoped ? (head + categoryShare + herdShare)   -- allocated, no general
                                  : Σ all expense.amount
feedExpenses       = ownerScoped ? ownerFeedCost(owner, from, to)
                                  : Σ feedPurchases(from, to)
totalExpenses      = otherExpenses + feedExpenses

totalRevenue       = Σ_owner sales.salePrice
cashReceived       = Σ_owner sales.amountPaid
outstanding        = totalRevenue − cashReceived

grossPnL           = totalRevenue − totalExpenses
costPerHeadPerDay  = totalExpenses / totalHeadDays
```

where, from `getOwnerExpenseBreakdownMinor`:

```
head          = Σ head expenses on the owner's animals (in full)
categoryShare = Σ_E∈categoryExpenses  E.amount × ownerHeadsInCat(E.cat, E.date)
                                               ÷ totalHeadsInCat(E.cat, E.date)
herdShare     = Σ_E∈herdExpenses      E.amount × ownerHeadsAlive(E.date)
                                               ÷ totalHeadsAlive(E.date)
```

Category breakdown, expense trend and sales trend charts use the same
owner‑attribution filters.

### 5.2 Income Statement (`getIncomeStatement`)

```
revenue.total      = Σ_owner sales.salePrice
costs.animalPurch. = Σ_owner animals.purchaseCost  (acquired in period)
costs.byCategory   = ownerScoped ? allocated share grouped by expense category
                                  : Σ all expense.amount grouped by category
costs.feed         = ownerScoped ? ownerFeedCost(owner, from, to)
                                  : Σ feedPurchases(from, to)
costs.total        = animalPurchases + feed + Σ byCategory
grossProfit        = revenue.total − costs.total
profitMargin       = grossProfit / revenue.total

runningCostPerMonth:
  farmWide   = ownerScoped ? 0 : Σ general expenses                  -- per month
  animalWide = feed + head + categoryShare + herdShare               -- per month
  total      = farmWide + animalWide
  (period operating total ÷ months, months = periodDays / 30.4375)
```

> Under owner scope `farmWide` running cost is **0** by definition (general
> overhead is not the owner's). `animalWide` now includes the owner's **allocated
> herd share**, so it reconciles with the sum of their P&L rows.

### 5.3 P&L per animal (`getAllAnimalsPnL`)

The owner filter restricts which animal **rows** are returned, but the
category/herd **allocation denominators are always the whole farm's head count**
on the expense date — not the filtered subset. (Previously the denominator
shrank with the filter, so a filtered view inflated each animal's cost and no
longer reconciled with the Dashboard / Income Statement. Fixed.) Per animal:

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

## 6. Exports

The owner filter flows into every export:

- **Income Statement → PDF / Excel** — built from the owner‑scoped statement;
  already reflects the owner (header and figures), filename tagged with owner.
- **Dashboard → PDF Report** — KPIs **and** the P&L table are fetched with the
  owner; the report is titled "Owner Report (name)" with a scope note.
- **Dashboard → Export Excel** (`export.full`) — accepts `ownerId`. With an
  owner selected it produces an **owner report workbook**: Animals, Sales,
  Lambing, Weight Log, Expenses, P&L, Income Statement and Dashboard sheets are
  all scoped to the owner, the README states the scope, and the canonical
  round‑trip "Data ‑" backup sheets are **omitted** (a scoped report is not a
  whole‑farm backup). With **All Owners**, it remains the full backup workbook.
  Filename: `lfms-owner-<id>-report-<date>.xlsx` vs `lfms-export-<date>.xlsx`.

## 7. Worked example

Farm has 10 head; Owner A owns 4 of them. In June:

- Electricity (general): EGP 2,000 → **excluded** for Owner A.
- Vet visit billed to Owner A's animal #A‑12 (head): EGP 500 → **included in full**.
- Category "Fattening" dewormer (category): EGP 1,000, Owner A has 4 of 8 head
  in that category on the expense date → Owner A is charged **1,000 × 4/8 = 500**
  (the same share the P&L gives those 4 animals).
- Herd water delivery: EGP 500, Owner A has 4 of 10 head alive that day →
  Owner A is charged **500 × 4/10 = 200**.
- Feed: no per‑owner purchase exists; Owner A's 4 animals' ration plans over
  June model EGP 3,200 of consumption → **that** is Owner A's feed cost.
- Owner A sold animal #A‑09 for EGP 9,000 → revenue 9,000.

Owner A's June other‑expenses = 500 (head) + 500 (category share) + 200 (herd
share) = **1,200**; feed = **3,200**; the 2,000 electricity is excluded. These
figures match the sum of Owner A's four P&L rows.

## 8. Implementation map

| Layer | File | Change |
|---|---|---|
| Feed model | `server/db.ts` → `getOwnerFeedCostMinor` | Consumption‑based owner feed cost |
| Expense allocation | `server/db.ts` → `allocateOwnerExpensesPure` / `getOwnerExpenseBreakdownMinor` | Owner's allocated head/category/herd share (matches P&L) |
| Dashboard | `server/db.ts` → `getDashboardKPIs` | `ownerId` scoping for heads, allocated expenses, feed, revenue |
| Income Statement | `server/db.ts` → `getIncomeStatement` | Allocated owner expenses + modelled feed |
| Operational | `server/db.ts` → `getVaccinationRecords`, `getLambingLog` | `ownerId` filter |
| Exports | `server/routers/export.ts`, `client/src/lib/pdfReports.ts` | Owner‑scoped report workbook + owner‑labelled PDF |
| Routers | `server/routers/{dashboard,animals,vaccination,breeding,export}.ts` | Accept `ownerId` |
| Global filter | `client/src/contexts/OwnerFilterContext.tsx` | Persisted owner selection |
| Control | `client/src/components/OwnerFilterSelect.tsx` + `DashboardLayout.tsx` | Owner selector on every page |
| Pages | Dashboard, Animals, PnL, IncomeStatement, Expenses, Sales, Fattening, Breeding, AnimalVaccinations | Read global owner; redundant local owner dropdowns removed |
| Tests | `server/ownerExpenseAllocation.test.ts` | Unit tests for the allocation math |
