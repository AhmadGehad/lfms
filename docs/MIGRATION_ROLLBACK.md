# Legacy-Safe SaaS Rollout And Rollback

## Hard Rule

The production LFMS tables are immutable during this rollout. Do not run
`db:push`, `db:migrate-tenancy`, or SQL files `0025` through `0031` against the
legacy database. They alter, backfill, or replace legacy schema objects and are
retired. The old migration runner now fails before opening a database
connection.

## Additive Target

Provision a separate control-plane database, for example `lfms_saas`, with a
dedicated least-privilege application account. It owns only new `saas_*`
tables: principals, OIDC identities, sessions, platform roles, companies,
memberships, entitlements, support grants, audit, jobs, exports, and tenant
database registry records.

Provision one dedicated tenant database for every new company. Tenant business
tables are created only in that database. The control plane stores an encrypted
database reference and public tenant identity; application code selects the
database only after resolving the hostname and active membership.

No sidecar table may foreign-key, update, lock, or trigger a legacy production
table. A read-only `saas_legacy_user_links` mapping may retain immutable legacy
user IDs or provider subjects for reporting, but it is not an authorization
source.

## Rollout

1. Create the control-plane database and tenant template in an isolated dev
   environment. Use separate runtime, migration, and reporting credentials.
2. Rehearse new-table-only migrations there. Assert that the legacy database
   received zero DDL, DML, lock, trigger, or index statements.
3. Deploy the Admin surface and new-tenant application routes only after the
   sidecar database is healthy. Existing customer URLs continue to use the
   legacy application and database unchanged.
4. Create new companies only in dedicated tenant databases. Their jobs, files,
   exports, cache keys, and telemetry must carry the tenant database identity.
5. Add a read-only legacy adapter for support and reporting. Label its data as
   legacy/live or eventual, depending on the source.
6. Migrate an existing customer only as a separate opt-in project: snapshot,
   checksum, binlog/CDC replication, reconciliation, parallel read validation,
   and a reversible per-customer writer switch. Never run a global cutover.

## Rollback

Rollback of a new tenant affects only its dedicated tenant database and its
control-plane registry row. The legacy customer remains on the original
application/database throughout, so the sidecar rollout cannot require a
legacy rollback or customer downtime.

If a legacy customer opt-in cutover later fails, route that customer's traffic
back to the unchanged legacy application/database, retain the sidecar copy for
forensics, and reconcile with the approved CDC/checksum procedure. Do not merge
unverified writes automatically.
