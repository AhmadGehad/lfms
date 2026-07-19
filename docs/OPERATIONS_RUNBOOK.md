# SaaS Operations Runbook

## Routine Checks

Monitor request rate, latency/error ratio, authentication failures, denied
cross-tenant attempts, active/suspended companies, quota usage, storage growth,
job queue age, lease expiry, retries/dead letters, audit ingestion,
control-plane and tenant-database health,
object-store errors, and backup age. Alert on readiness failure, sustained 5xx,
unexpected 401/403 spikes, repeated support requests, dead letters, migration
checksum drift, or storage quota anomalies.

## Company Lifecycle

- Create: platform permission, idempotency key, plan assignment, initial farm,
  owner membership, and audit in one controlled workflow.
- Suspend: optimistic version update; tenant APIs and workers fail closed. Data
  remains retained and inspectable only through authorized support scope.
- Reactivate: validate subscription/security state, update version, audit.
- Delete: use `platform.lifecycle.deletions.request`; it immediately blocks
  tenant access, records a 30-365 day deadline, and queues the required full
  export. A different MFA-authenticated administrator may approve only after
  retention and a clean completed export. Approval is purge-ready, not purge.
- Restore: keep the company suspended, provide a clean company-owned source and
  a clean full-export checkpoint from the last 24 hours, validate schema and
  tenant identity, then require a different MFA-authenticated approver. Keep the
  tenant suspended after execution until reconciliation passes.

Farm archive, membership removal, role/farm-grant changes, feature overrides,
and subscription changes use expected versions and audit before/after values.
Never hard-delete the last owner or silently erase data when disabling a
feature.

Detailed state gates and worker processor behavior are in
`docs/TENANT_LIFECYCLE.md`. Current web and worker code never perform permanent
purge.

## Support Access

Require ticket, reason, company, typed scopes, and expiry. Read-only grants can
activate for the requester; write grants require an MFA-authenticated different
approver. Confirm the Admin UI shows the grant. Every inspection uses the grant
ID and requester identity and writes audit. Revoke immediately after work or on
any scope discrepancy.

## Platform Administrator Access

Use the Admin `Platform admins` page for routine provisioning, suspension,
revocation, and full role replacement. These mutations require MFA and revoke
the target's active sessions immediately. Revoked administrators are terminal;
create a separately approved identity instead of reactivating one. The service
refuses any change that would remove the last active administrator with
platform management authority.

Use `pnpm run admin:bootstrap` only for documented recovery. The selected
`ADMIN_BOOTSTRAP_ROLE` replaces all previous roles transactionally. A changed
role set increments the administrator auth version and revokes active sessions.
The command refuses a role replacement that would leave no active holder of
`administrators.write`; bootstrap with `platform_admin` to restore authority.

## Job Failure

1. Inspect job type, company, attempts, sanitized error, and lease timestamps.
2. Confirm the tenant/farm is active and payload company matches the job row.
3. Fix the underlying condition; do not edit payload scope manually.
4. Requeue with a new audited operation or approved retry workflow.
5. Verify the idempotency/deduplication key prevented duplicate effects. For
   restore execution failures, confirm status returned to fenced `ready` before
   retry; do not activate the company while any restore is active.

## Security Incident

Revoke affected sessions and support grants; suspend the company if containment
requires it; rotate provider credentials through the secret manager; preserve
audit, structured logs, and request IDs; take a forensic snapshot; notify owners
under policy. Never put raw credentials or tokens in the incident record.

## Backup And Restore

Run encrypted point-in-time recovery and versioned private-object backups for
each new tenant database and the control plane. Quarterly, restore each to an
isolated environment, run schema/row/file integrity checks, test a tenant
export, and record RPO/RTO. The legacy database stays on its existing backup
procedure and is never targeted by SaaS recovery tooling. Tenant deletion does
not remove backup data before the documented retention period expires.
