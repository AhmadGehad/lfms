# LFMS Architecture

Livestock Farm Management System (Azal Farms). Full-stack TypeScript monorepo:
React 19 + Vite client, Express + tRPC server, MySQL via Drizzle ORM.

```
client/src/          React app
  components/        Shared UI (shadcn/ui primitives + app components)
  contexts/          ThemeContext, DesignVersionContext, OwnerFilterContext
  designs/           Old/New design system split (see "Design versions")
    old/             Old shell (DashboardLayout)
    new/             New shell, components, redesigned pages
  hooks/             usePermissions, usePreferences, useCurrency, ...
  lib/               trpc client, i18n (EN + AR)
  pages/             OLD design pages — also the business/UI logic reference
server/
  _core/             Infra: trpc setup, auth SDK, cookies, oauth, devAuth, env
  routers/           One tRPC router per domain (animals, sales*, feed, ...)
  db.ts              All Drizzle query helpers (single data-access module)
  revert.ts          Audit-log revert engine
  drizzle/             Schema + hand-numbered SQL migrations (0000–0019)
shared/              permissions.ts — role/permission model used by BOTH sides
```

*Sales/notifications/audit/user routers currently live in `server/routers/dashboard.ts`.

## Layers and rules

1. **Client pages** call tRPC hooks only; no direct fetch/SQL.
2. **`designs/*` is presentation-only.** Business logic and permission gating
   live in shared pages/hooks; Old and New designs may differ only in shell and
   screen composition. Route table and permission gates are identical
   (`designs/routes.tsx` vs `designs/new/NewRoutes.tsx`).
3. **Routers** validate with zod, authorize with a permission middleware, call
   `db.ts` helpers, and write an audit entry for every mutation.
4. **`db.ts`** is the only module that touches Drizzle/SQL. Helpers accept an
   optional `tx?: DbOrTx` so routers can compose them inside transactions.

## Design versions (Old / New)

Two independent per-user axes: design version `old|new` and theme
`light|dark|system`.

- Resolution order: URL `?design=` → user pref → role default → global setting
  (`system_settings ui.designVersion`) → `VITE_DEFAULT_DESIGN` → `old`.
- `DesignRouter` lazy-loads `old/OldDesign` or `new/NewDesign` as separate
  bundles; New is wrapped in an error boundary that falls back to Old on crash.
- Preferences persist in `user_settings` (server) with localStorage cache
  (`usePreferences` ↔ `server/routers/preferences.ts`).
- New design system components (`designs/new/components/`): `DataTable`
  (sort/pagination/density/column-hiding/selection/bulk-bar/mobile cards),
  `EntityTable` (spec-driven reference-data CRUD), `FormLayout`,
  `ConsequenceConfirm` (surfaces side-effects before destructive actions),
  `ActionCenter`, `KpiCard`, `StatusBadge`, `CommandPalette` (⌘K), `QuickAdd`,
  `AnimalWorkflows` (shared register / weigh-in / sale / bulk-sale / quick-expense
  dialogs).
- New pages are at feature parity with Old (parity pass 2026-07-03). Two pages
  intentionally render the Old implementation inside the New shell: `FarmMap`
  (bespoke canvas shape editor) and `Fattening`.

## AuthN / AuthZ

- **Sessions**: JWT (jose) in an `httpOnly` cookie; `secure` + `sameSite`
  derived from the request (`_core/cookies.ts`). OAuth flow in `_core/oauth.ts`;
  local dev login bypass works only when `!isProduction` AND the host is
  loopback (`_core/devAuth.ts`), with open-redirect guarding.
- **Roles** (ranked): `viewer < user < staff < supervisor < admin < owner`.
  Owner is the immutable recovery authority; every other role's page×action
  matrix is configurable and stored server-side (permission overrides).
- **Server-authoritative checks**: every procedure uses
  `permissionProcedure(page, action)` (or `anyPermissionProcedure` /
  role-tier procedures) from `_core/trpc.ts`. Client-side `usePermissions` and
  `PermissionGate` are UX-only; the server re-checks everything.

## Data integrity

- **Transactions + row locks** for read-modify-write:
  - Animal registration locks the category row (`getCategoryForUpdate`,
    `SELECT ... FOR UPDATE`) and allocates IDs from a per-category sequence,
    with a duplicate-key CONFLICT fallback.
  - Sale payment/edit locks the sale row (`getSaleForUpdate`) so concurrent
    payments serialize and `paid <= price` is enforced against current values.
  - Bulk operations, import, backup restore, and breeding promotion all run in
    `db.transaction`.
- **Soft delete / Recycle Bin**: domain deletes set `deletedAt` and are
  restorable per entity type (`server/routers/softDelete.ts`); purge is
  admin-gated and permanent.
- **Audit log + revert**: every mutation writes old/new values + user + IP;
  `revert.ts` can undo the newest non-reverted entry per entity, and the revert
  itself is audited.
- **Excel data contract** (`server/excelDataContract.ts`, currently v7): the
  canonical table list for export/import/backup. Adding a table requires a
  contract version bump and test update.

## i18n

`client/src/lib/i18n.ts` holds full EN + AR resources. New-design strings are
added via the `__newEn` / `__newAr` objects deep-merged near the end of the
file (existing keys win — do not hand-edit the giant literals for new-design
strings). UI is fully RTL-aware (`dir` switches with language).

## Database / migrations

MySQL (not Postgres). Migrations are hand-numbered SQL files in `drizzle/`
(`0000`–`0019`); the drizzle journal is stale, so write manual SQL rather than
trusting `drizzle-kit generate`.

Post-deploy DB step for the design switch rollout: apply
`drizzle/0019_user_settings.sql`. It creates `user_settings`, which persists
per-user design/theme preferences; until applied, the app falls back to
client-side cache and logs preference warnings.

## Testing

`vitest` (`npx vitest run`). 174 tests; 5 known pre-existing failures in
`server/pregnancyDates.test.ts` / lambing date drift (off-by-one around date
boundaries) — unrelated to app features.

## Known gaps (accepted, not yet addressed)

- No explicit CSRF token / CORS origin allowlist. Mitigated in practice by
  JSON-only tRPC POSTs (preflight-gated) + `httpOnly` cookies, but an origin
  check would make it explicit.
- No rate limiting (including auth endpoints).
- `express.json({ limit: "50mb" })` is global (needed for import/backup
  payloads); per-route limits would shrink the DoS surface.
- Client pages widely use `any` for tRPC row types instead of inferred types.
