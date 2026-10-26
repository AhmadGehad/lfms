# LFMS Architecture

Livestock Farm Management System (Azal Farms). Full-stack TypeScript monorepo:
React 19 + Vite client, Express + tRPC server, MySQL via Drizzle ORM.

```
client/src/          React app
  components/        Shared UI (shadcn/ui primitives + app components)
  contexts/          ThemeContext, OwnerFilterContext
  designs/new/       App shell, route table, design-system components, pages
  hooks/             usePermissions, usePreferences, useCurrency, ...
  lib/               trpc client, i18n (EN + AR)
  pages/             Auth/system screens, Landing, and Fattening + FarmMap
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
2. **Routing and permission gating** live in `designs/new/NewRoutes.tsx` and
   `designs/new/PermissionGate.tsx`; every page is lazy-loaded behind its gate.
3. **Routers** validate with zod, authorize with a permission middleware, call
   `db.ts` helpers, and write an audit entry for every mutation.
4. **`db.ts`** is the only module that touches Drizzle/SQL. Helpers accept an
   optional `tx?: DbOrTx` so routers can compose them inside transactions.

## UI design

There is one design (the former "New" design; the Old design and the design
switch were removed 2026-10-26). Theme is a per-user `light|dark|system` choice.

- Preferences persist in `user_settings` (server) with localStorage cache
  (`usePreferences` ↔ `server/routers/preferences.ts`).
- New design system components (`designs/new/components/`): `DataTable`
  (sort/pagination/density/column-hiding/selection/bulk-bar/mobile cards),
  `EntityTable` (spec-driven reference-data CRUD), `FormLayout`,
  `ConsequenceConfirm` (surfaces side-effects before destructive actions),
  `ActionCenter`, `KpiCard`, `StatusBadge`, `CommandPalette` (⌘K), `QuickAdd`,
  `AnimalWorkflows` (shared register / weigh-in / sale / bulk-sale / quick-expense
  dialogs).
- `FarmMap` (bespoke canvas shape editor) and `Fattening` are not yet
  redesigned; they live in `pages/` and render inside the same shell.

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
per-user UI preferences; until applied, the app falls back to
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
