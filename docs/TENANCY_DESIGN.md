# LFMS Tenancy Design

This document records the implemented tenancy decision. Detailed security,
migration, deployment, operations, and test procedures are in the companion
documents in this directory.

## Decision

Legacy LFMS production tables are immutable. They will not receive columns,
indexes, foreign keys, triggers, backfills, locks, or data updates from the
SaaS rollout.

> **Implementation status (2026-07-14)**: the deployed code implements the
> sidecar control plane (`saas_*` tables) but not yet a dedicated database per
> company. All tenant business data currently lives in shared `saas_azal_*`
> tables inside the same database, scoped by `companyId`/`farmId` and enforced
> through `tenantScope`, the company write fence, and composite foreign keys.
> Database-per-tenant routing (points 2 and 4 below) remains a design target.

LFMS therefore uses a hybrid sidecar model:

1. A separate SaaS control-plane database holds principals, platform access,
   companies, memberships, entitlements, audit, sessions, jobs, and storage
   metadata.
2. Each new company receives a dedicated tenant database initialized from the
   SaaS tenant schema. Database routing, not a discriminator column, is the
   primary tenant isolation boundary.
3. The existing customer remains on the untouched legacy LFMS database through
   a read-only compatibility adapter until an explicit per-customer migration
   is approved and verified.
4. The hostname resolves a company, then the control plane resolves its
   principal, role, enabled features, and tenant database handle.
5. Public ULIDs are used at API and file boundaries. Internal numeric IDs never
   establish authorization.
6. Jobs, files, exports, caches, notifications, metrics, and audit records use
   the resolved tenant database identity, never a client-supplied connection.

The separate Admin surface uses `admin.<BASE_DOMAIN>`, a dedicated workforce
OIDC client, separate cookies, platform RBAC, MFA-aware sessions, and audited
support grants. Tenant sessions cannot authenticate to it.

## Why Hybrid Sidecar

A shared-schema conversion would require altering every legacy business table
and would create an unsafe all-customer cutover. Schema-per-tenant has the same
legacy conversion problem. A dedicated database per new tenant provides the
strongest practical isolation, keeps customer backups and restores independent,
and leaves the live customer schema unchanged. The extra provisioning and
reporting complexity is contained in the new control plane.

## Scope Rules

- New tenant database: one company per database; farms and historical events
  are local database entities. Moving an animal does not rewrite its prior
  sales, weights, vaccinations, status changes, or births.
- Legacy database: only the existing customer can resolve the compatibility
  adapter. New companies can never query legacy tables.
- Restricted membership: only assigned farms. "All farms" means all assigned
  farms, not every company farm.
- Company-wide rows remain visible to active company members when their role
  and feature entitlement permit the operation.
- Suspended companies fail closed before business procedures execute.

See [legacy immutability and rollout](./LEGACY_IMMUTABILITY.md) for the
non-disruptive migration path.

## Feature Behavior

Feature keys resolve from plan defaults plus company overrides. Backend
middleware enforces the result. `enabled` permits reads and writes,
`read_only` preserves existing data and blocks mutation, and `disabled` blocks
access without deleting data. Farm, user, animal, and storage quotas are checked
inside a transaction after acquiring a narrow per-company quota lock.

## References

- [SaaS architecture](./SAAS_ARCHITECTURE.md)
- [Threat model](./THREAT_MODEL.md)
- [Migration and rollback](./MIGRATION_ROLLBACK.md)
- [Deployment](./DEPLOYMENT.md)
- [Operations runbook](./OPERATIONS_RUNBOOK.md)
- [Testing](./TESTING.md)
