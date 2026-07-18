# Legacy Production Immutability

## Protected Contract

All current LFMS production tables and data are protected. The SaaS project
must not alter their columns, indexes, constraints, triggers, data, row locks,
or availability. This includes `users`, farms, animals, sales, breeding,
vaccinations, feed, expenses, audit, notifications, and every related legacy
table.

The former shared-schema migrations are retained for audit only and are
disabled. They are not a deployment path.

## Sidecar Boundary

New SaaS state lives in the additive shared `saas_*` schema. Tenant business
rows are scoped by company and farm at the database and application layers.
The legacy tables are read-only to SaaS migration/runtime identities and are
reachable only by a reporting/compatibility account with no write or DDL
privileges.

## Existing Customer

The existing customer stays on the current legacy application/database. Do not
present its legacy rows to any new company. Any future move is an opt-in,
per-customer replication project using snapshot checksums and CDC/binlog tailing
before a reversible traffic switch.

## Required Provisioning

Before SaaS login can work, a database operator must provide:

1. The additive `saas_*` schema and least-privilege credentials.
2. A read-only legacy reporting account if Admin support/reporting needs legacy
   visibility.
3. Backup, restore, and CDC capability for any later existing-customer opt-in.
