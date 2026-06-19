# LFMS Multi-Tenant SaaS Architecture & Security Design

> **Status**: Conditionally approved — six final corrections required before schema implementation
> **Date**: 2026-06-19 (rev 4 — third security review feedback incorporated)
> **Scope**: Full transformation from single-farm to multi-tenant, company-based SaaS

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Tenancy Model](#2-tenancy-model)
3. [Config Sharing Model](#3-config-sharing-model)
4. [Database Architecture](#4-database-architecture)
5. [Session & Tenant Resolution](#5-session--tenant-resolution)
6. [Authentication Architecture](#6-authentication-architecture)
7. [Authorization & RBAC](#7-authorization--rbac)
8. [Tenant Isolation Enforcement](#8-tenant-isolation-enforcement)
9. [Company Registration & Onboarding](#9-company-registration--onboarding)
10. [Multi-Farm Management](#10-multi-farm-management)
11. [Membership & Invitations](#11-membership--invitations)
12. [Audit & Compliance](#12-audit--compliance)
13. [File Storage & Encryption](#13-file-storage--encryption)
14. [Subscriptions, Billing & Usage Limits](#14-subscriptions-billing--usage-limits)
15. [Scalability, Backups & Disaster Recovery](#15-scalability-backups--disaster-recovery)
16. [Migration Strategy](#16-migration-strategy)
17. [Threat Model & Security Checklist](#17-threat-model--security-checklist)
18. [Tenant Propagation Across Async Systems](#18-tenant-propagation-across-async-systems)

---

## 1. Current State Assessment

| Area | Current (verified from code) | Multi-Tenant Gap |
|------|------------------------------|------------------|
| **Auth** | OAuth (Manus SDK) → JWT cookie (`sdk.ts:259`) → `users.openId` | No tenant concept in session |
| **Context** | `createContext` (`context.ts:16`) loads `user` + global `permissionOverrides` | No `companyId` in context |
| **Schema** | 21 tables (`schema.ts`), none have `companyId`/`farmId` | All data shared, no tenant boundary |
| **Uniques** | Global uniques on `animals.animalId`, `groups.groupCode`, `species.name`, etc. | Two companies can't share same animal ID |
| **ID sequences** | `animalCategories.idSequence` is global | All companies share one numbering space |
| **Permissions** | `rolePermissions` table, global role overrides (`permissionStore.ts`) | No per-company roles, no explicit deny |
| **db.ts** | ~100+ functions, none filter by tenant | Every function needs `TenantContext` |
| **Routers** | 16 routers on `protectedProcedure`/`permissionProcedure` | No tenant-scoped middleware |
| **Cookies** | `sameSite: "none"` (`cookies.ts:45`) | Insecure for SaaS — CSRF risk |
| **Audit log** | `auditLog` table, no `companyId` | Cross-tenant audit leakage |
| **File storage** | `animals.photoUrl` stores URLs, no per-tenant path | No tenant isolation on file access |
| **Env/secrets** | `env.ts` reads from `process.env` | Single-tenant, no per-tenant key management |

**Preserve**: tRPC + Drizzle stack, role hierarchy (`permissions.ts`), soft-delete pattern, audit logging, JWT cookies.

---

## 2. Tenancy Model

### Decision: Shared Database, Shared Schema with `companyId`

**Rationale**: Shared-schema with composite database foreign keys, mandatory `TenantContext` in all repository methods, and CI/integration-test enforcement provides production-grade tenant isolation without the operational overhead of schema-per-tenant.

| Factor | Shared-Schema | Schema-per-Tenant |
|--------|--------------|-------------------|
| Isolation | Logical + DB-enforced (composite FKs) | Physical (DB-level) |
| Ops overhead | One schema, one migration path | N schemas × M migrations |
| Connection pooling | One pool | Pool per tenant or routing layer |
| Cross-tenant queries | Trivial (billing, analytics) | Requires federation |
| Cost at 1000 tenants | One DB instance | 1000 schemas/DBs |

**Defense-in-depth (5 layers)**:

1. **tRPC middleware** (`companyProcedure`): reject no-tenant/suspended
2. **Router input validation**: `farmId` from input validated against `ctx.companyId` + farm access
3. **Repository layer**: every method takes `TenantContext`, every WHERE includes `company_id` + farm scope
4. **Database constraints**: composite foreign keys prevent cross-company relationships
5. **CI gate**: ESLint/AST rule banning direct table access outside approved repository modules + cross-tenant integration tests + mutation tests

---

## 3. Config Sharing Model

### Company-wide (no `farmId`)

`species`, `animal_categories`, `animal_statuses`, `birth_types`, `vaccines`, `feed_items`, `expense_categories`, `expense_sub_categories`, `owners`, `system_settings`, `role_permissions`

### Farm-scoped (`farmId` NOT NULL)

`groups`, `animals`, `feed_stock_ledger`

### Immutable farm snapshot (event-level `farmId`, NOT derived from animal's current farm)

Historical records store an **immutable `farm_id`** set from the animal's farm at event creation time. This is NOT updated when the animal moves farms. Deriving farm from the animal's current farm would:
- Attribute old weight records to the new farm after movement
- Make old vaccinations visible to users of the new farm
- Remove historical records from the original farm's users
- Produce incorrect historical reports and financial attribution

- `weight_log.farm_id` — set from `animals.farm_id` at weigh-in time, never updated
- `vaccination_records.farm_id` — set from `animals.farm_id` at vaccination time, never updated
- `lambing_log.farm_id` — set from dam's `farm_id` at lambing time, never updated
- `sales.farm_id` — set from `animals.farm_id` at sale time, never updated
- `animal_status_history.farm_id` — set from `animals.farm_id` at status change time, never updated

Each table has **both** composite FKs:
```sql
FOREIGN KEY (company_id, animal_id) REFERENCES animals(company_id, id),
FOREIGN KEY (company_id, farm_id) REFERENCES farms(company_id, id)
```

When an animal moves farms (`moveAnimal`), only `animals.farm_id` changes. All historical records retain their original `farm_id`.

### Explicit scope type (company-level vs farm-level)

- `expenses`: add `scope_type ENUM('company', 'farm') NOT NULL` + `farmId` nullable. Company expenses have `scope_type='company', farmId=NULL`. Farm expenses have `scope_type='farm', farmId NOT NULL`.
- `ration_plans`: company-wide by default. `farmId` nullable for farm-specific overrides.
- `feed_item_price_history`: `farmId` nullable. NULL = company-wide price.
- `notifications`: `companyId` NOT NULL, `farmId` nullable (context only).
- `audit_log`: `companyId` NOT NULL, `farmId` nullable (context only).

### Farm-restricted user visibility rule

When a user has `farm_access_mode='restricted'`:
- **Farm-scoped queries without explicit `farmId`**: return only records from assigned farms (NOT all company farms). "All Farms" for a restricted user means all **assigned** farms.
- **Company-wide records** (e.g., company-level expenses, species, categories): visible to all users regardless of farm access — these are not farm-restricted.
- **Farm-scoped records for non-assigned farms**: not visible.

### ID sequences — per-company

Move to `company_category_sequences(companyId, categoryId, idSequence, lambIdSequence)`. `generateNextAnimalId()` locks per-company sequence row with `FOR UPDATE` inside the same transaction as the animal insert. Retry-safe on unique conflict/deadlock.

---

## 4. Database Architecture

### New tables

```sql
-- ─── COMPANIES (tenants) ─────────────────────────────────────────────────────
CREATE TABLE companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id BINARY(16) NOT NULL UNIQUE,           -- ULID, for URLs/API/files
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  lifecycle_status ENUM('active','suspended_by_admin','deletion_requested','purging')
    NOT NULL DEFAULT 'active',
  settings JSON,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) NOT NULL,
  deleted_at TIMESTAMP(6)
);
-- NOTE: No owner_user_id — ownership is derived from company_users.role='owner'.
-- NOTE: No status/plan fields — those live in company_subscriptions and
--   are resolved through a centralized entitlement service.

-- ─── FARMS ───────────────────────────────────────────────────────────────────
CREATE TABLE farms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id BINARY(16) NOT NULL UNIQUE,
  company_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(20) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) NOT NULL,
  created_by_membership_id INT,
  deleted_at TIMESTAMP(6),
  deleted_by_membership_id INT,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  UNIQUE KEY uq_farms_company_id_id (company_id, id),    -- composite FK target
  -- Soft-delete-safe unique: active_normalized_code (generated column, see below)
  -- Replaces UNIQUE(company_id, code) which blocks code reuse after soft-delete
);

-- ─── COMPANY_USERS (membership) ──────────────────────────────────────────────
CREATE TABLE company_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('owner','admin','supervisor','staff','user','viewer') DEFAULT 'viewer' NOT NULL,
  status ENUM('invited','active','disabled') DEFAULT 'invited' NOT NULL,
  farm_access_mode ENUM('all','restricted') NOT NULL DEFAULT 'restricted',
  authorization_version INT NOT NULL DEFAULT 1,     -- bumped on role/status/farm-access change
  invited_by_membership_id INT,
  joined_at TIMESTAMP(6),
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uq_company_users_company_id_id (company_id, id),
  UNIQUE KEY uq_company_users_company_user (company_id, user_id),
  -- Enforce at most one active owner per company (generated column):
  owner_company_guard INT
    GENERATED ALWAYS AS (
      CASE WHEN role = 'owner' AND status = 'active' THEN company_id ELSE NULL END
    ) STORED,
  UNIQUE KEY uq_company_users_owner_guard (owner_company_guard)
  -- Application transactions enforce at least one owner (cannot remove last owner).
);

-- ─── COMPANY_USER_FARMS (explicit farm assignment) ───────────────────────────
CREATE TABLE company_user_farms (
  company_id INT NOT NULL,
  company_user_id INT NOT NULL,
  farm_id INT NOT NULL,
  PRIMARY KEY (company_user_id, farm_id),
  FOREIGN KEY (company_id, farm_id) REFERENCES farms (company_id, id),
  FOREIGN KEY (company_id, company_user_id) REFERENCES company_users (company_id, id)
);
-- Access is determined by company_users.farm_access_mode:
--   'all' → user can access all farms in the company (ignore this table)
--   'restricted' → user can only access farms listed in this table
-- Owners default to 'all'; everyone else defaults to 'restricted'.
-- NEVER infer access from absence of rows.

-- ─── COMPANY_INVITATIONS ─────────────────────────────────────────────────────
CREATE TABLE company_invitations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id BINARY(16) NOT NULL UNIQUE,
  company_id INT NOT NULL,
  email VARCHAR(320) NOT NULL,
  role ENUM('owner','admin','supervisor','staff','user','viewer') DEFAULT 'viewer' NOT NULL,
  token_hash BINARY(32) NOT NULL UNIQUE,           -- SHA-256 hash, never raw token
  expires_at TIMESTAMP(6) NOT NULL,
  accepted_at TIMESTAMP(6),
  accepted_by INT,
  invited_by_membership_id INT NOT NULL,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- ─── SUBSCRIPTION_PLANS ──────────────────────────────────────────────────────
CREATE TABLE subscription_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  max_farms INT,                                    -- NULL = unlimited
  max_animals INT,                                  -- NULL = unlimited
  max_users INT,                                    -- NULL = unlimited
  features JSON,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  stripe_price_id VARCHAR(200),                     -- Stripe price ID
  plan_version INT NOT NULL DEFAULT 1,              -- snapshot version for existing subscribers
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);
-- NOTE: Do not mutate old plans in a way that retroactively changes existing
--   subscribers. Use plan_version to snapshot terms at subscription time.
-- NOTE: NULL = unlimited for limit fields. Do not mix -1, 0, and nullable.

-- ─── COMPANY_SUBSCRIPTIONS ───────────────────────────────────────────────────
CREATE TABLE company_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  plan_id INT NOT NULL,
  plan_snapshot JSON,                               -- snapshot of plan terms at subscription time
  provider_status ENUM('trialing','active','past_due','unpaid','canceled',
    'incomplete','paused','unknown')
    NOT NULL DEFAULT 'trialing',
  period_start TIMESTAMP(6) NOT NULL,
  period_end TIMESTAMP(6) NOT NULL,
  trial_ends_at TIMESTAMP(6),                       -- explicit trial end
  grace_ends_at TIMESTAMP(6),                       -- past-due grace period end
  external_customer_id VARCHAR(200) UNIQUE,         -- Stripe customer ID
  external_subscription_id VARCHAR(200) UNIQUE,     -- Stripe subscription ID
  is_current BOOLEAN NOT NULL DEFAULT TRUE,         -- exactly one current subscription per company
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
  -- Enforce at most one current subscription per company (generated column):
  -- MySQL does not support filtered unique indexes. UNIQUE(company_id, is_current)
  -- would allow only one FALSE row as well as one TRUE row, blocking history.
  current_company_guard INT
    GENERATED ALWAYS AS (
      CASE WHEN is_current = TRUE THEN company_id ELSE NULL END
    ) STORED,
  UNIQUE KEY uq_one_current_subscription (current_company_guard)
);
-- Allows unlimited historical subscriptions (is_current=FALSE → guard=NULL → no conflict)
-- and at most one current subscription (is_current=TRUE → guard=company_id → UNIQUE).

-- ─── COMPANY_USAGE_CURRENT (atomic quota enforcement) ────────────────────────
CREATE TABLE company_usage_current (
  company_id INT PRIMARY KEY,
  animal_count INT NOT NULL DEFAULT 0,
  user_count INT NOT NULL DEFAULT 0,
  farm_count INT NOT NULL DEFAULT 0,
  storage_bytes BIGINT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 0,                   -- optimistic concurrency
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
-- Authoritative source for quota checks. Locked/updated in the SAME transaction
-- as resource creation. usage_daily is analytics history only.

-- ─── USAGE_DAILY (analytics snapshot) ────────────────────────────────────────
CREATE TABLE usage_daily (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  snapshot_date DATE NOT NULL,
  animal_count INT NOT NULL DEFAULT 0,
  user_count INT NOT NULL DEFAULT 0,
  farm_count INT NOT NULL DEFAULT 0,
  storage_bytes BIGINT NOT NULL DEFAULT 0,
  api_calls_today INT NOT NULL DEFAULT 0,
  UNIQUE(company_id, snapshot_date),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- ─── COMPANY_SECURITY_POLICIES ───────────────────────────────────────────────
CREATE TABLE company_security_policies (
  company_id INT PRIMARY KEY,
  require_mfa BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_mfa_methods JSON,                         -- e.g., ["totp"]
  privileged_session_max_age INT NOT NULL DEFAULT 900,  -- seconds
  require_mfa_for_owners BOOLEAN NOT NULL DEFAULT TRUE,
  require_mfa_for_billing BOOLEAN NOT NULL DEFAULT TRUE,
  require_mfa_for_data_export BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) NOT NULL,
  updated_by_membership_id INT,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- ─── SESSIONS (server-side, revocable) ───────────────────────────────────────
CREATE TABLE sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id_hash VARCHAR(128) NOT NULL UNIQUE,     -- SHA-256(opaque_token + server_pepper)
  user_id INT NOT NULL,
  last_selected_company_id INT,                     -- UX preference ONLY, never for authorization
  authentication_level ENUM('partial','full') NOT NULL DEFAULT 'partial',
  mfa_verified_at TIMESTAMP(6),
  authentication_methods JSON,                      -- e.g., ["password","totp"]
  user_auth_version INT NOT NULL,                   -- compared against users.auth_version
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  last_seen_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  idle_expires_at TIMESTAMP(6) NOT NULL,
  absolute_expires_at TIMESTAMP(6) NOT NULL,
  revoked_at TIMESTAMP(6),
  ip_address VARCHAR(45),                           -- risk signal, not hard binding
  user_agent VARCHAR(500),                          -- risk signal, not hard binding
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (last_selected_company_id) REFERENCES companies(id) ON DELETE SET NULL
);
-- NOTE: No company_id for authorization. Company is resolved from the route
--   on every request. last_selected_company_id is a UX preference only.
-- NOTE: Opaque session cookie does not require cookie signing; the random
--   token + server-side hash lookup provides integrity. Add a server-side
--   pepper to the hash for defense-in-depth.
-- NOTE: Throttle last_seen_at updates (e.g., once every 5 minutes) to avoid
--   a DB write on every API request.
-- NOTE: Session reads must use primary DB or strongly consistent cache,
--   not a lagging read replica.
-- NOTE: Max 5 active sessions per user (configurable).

-- ─── USER_IDENTITIES (OAuth + password coexistence) ──────────────────────────
CREATE TABLE user_identities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(50) NOT NULL,                    -- 'password', 'google', 'apple', 'microsoft', 'github', 'manus'
  provider_subject VARCHAR(255),                    -- openId for OAuth, NULL for password
  provider_email VARCHAR(320),
  provider_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  linked_at TIMESTAMP(6),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(provider, provider_subject),
  UNIQUE KEY uq_user_identities_user_provider (user_id, provider)
);
-- NOTE: users.primary_email_identity_id references this table.
--   Use a composite relationship ensuring the identity actually belongs to the same user:
--   ALTER TABLE users ADD UNIQUE KEY uq_users_id_id (id, primary_email_identity_id);
--   Then: FOREIGN KEY (id, primary_email_identity_id) REFERENCES user_identities (user_id, id)
--   This prevents pointing to another user's identity.

-- ─── PASSWORD_CREDENTIALS ────────────────────────────────────────────────────
CREATE TABLE password_credentials (
  user_id INT PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,              -- argon2id
  password_changed_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  password_needs_rehash BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ─── AUTHENTICATION_TOKENS (verification, reset, linking) ────────────────────
CREATE TABLE authentication_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  user_identity_id INT,                             -- bind token to specific identity (for verify_email/identity_link)
  purpose ENUM('verify_email','reset_password','change_email','identity_link') NOT NULL,
  token_hash BINARY(32) NOT NULL UNIQUE,            -- SHA-256 hash, never raw token
  target_value VARCHAR(320),                        -- email being verified/changed, etc.
  attempts INT NOT NULL DEFAULT 0,                  -- track failed verification attempts
  expires_at DATETIME(6) NOT NULL,
  used_at DATETIME(6),
  created_at DATETIME(6) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (user_identity_id) REFERENCES user_identities(id),
  INDEX idx_auth_tokens_lookup (user_id, purpose, expires_at)
);
-- NOTE: For verify_email and identity_link purposes, user_identity_id is NOT NULL.
--   This ensures the correct identity is verified, not just the user account.
--   For reset_password and change_email, user_identity_id may be NULL.

-- ─── MFA_CREDENTIALS ─────────────────────────────────────────────────────────
CREATE TABLE mfa_credentials (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  method ENUM('totp') NOT NULL,                     -- v1: TOTP only. WebAuthn requires separate table (see below).
  encrypted_secret BLOB,                            -- envelope-encrypted
  encryption_key_version VARCHAR(50),               -- for key rotation
  last_used_totp_step BIGINT,                       -- prevents replay within same TOTP window
  enabled_at DATETIME(6),
  disabled_at DATETIME(6),
  created_at DATETIME(6) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uq_mfa_credentials_user_method (user_id, method)
);
-- NOTE: v1 supports TOTP only. WebAuthn requires a separate table with:
--   credential_id, public_key, sign_counter, transports, rp_id, rp_name.
--   Do not include 'webauthn' in the method enum until that table exists.
-- NOTE: last_used_totp_step must be updated atomically during TOTP validation
--   (UPDATE ... WHERE last_used_totp_step < current_step) to stop concurrent replay.

-- ─── MFA_RECOVERY_CODES ──────────────────────────────────────────────────────
CREATE TABLE mfa_recovery_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  mfa_credential_id BIGINT NOT NULL,
  code_hash VARCHAR(255) NOT NULL,                  -- argon2id hash
  used_at DATETIME(6),
  created_at DATETIME(6) NOT NULL,
  FOREIGN KEY (mfa_credential_id) REFERENCES mfa_credentials(id)
);

-- ─── OUTBOX_EVENTS (transactional email/jobs) ────────────────────────────────
CREATE TABLE outbox_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT,
  event_type VARCHAR(100) NOT NULL,                 -- 'email.verification', 'email.invitation', etc.
  payload JSON NOT NULL,                            -- encrypted if contains tokens/secrets
  encrypted_payload BLOB,                           -- for payloads containing raw tokens
  encryption_key_version VARCHAR(50),
  status ENUM('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMP(6),
  locked_by VARCHAR(100),                           -- worker ID for leasing
  locked_until TIMESTAMP(6),                        -- lease expiry for crash recovery
  deduplication_key VARCHAR(200),                   -- prevent duplicate processing
  last_error TEXT,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  processed_at TIMESTAMP(6),
  UNIQUE KEY uq_outbox_dedup (company_id, event_type, deduplication_key)
);
-- NOTE: deduplication_key has an actual UNIQUE constraint, not just a comment.
-- NOTE: If payload contains raw tokens (invitation, verification), store in
--   encrypted_payload with envelope encryption. Delete/erase after sending.
--   Never store raw tokens in plaintext JSON payload.
-- NOTE: locked_by + locked_until enable worker leasing and crash recovery.
--   A worker that crashes leaves event in 'processing' with locked_until;
--   another worker can claim it after lease expires.

-- ─── IDEMPOTENCY_KEYS ────────────────────────────────────────────────────────
CREATE TABLE idempotency_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_hash VARCHAR(128) NOT NULL,                   -- SHA-256 of client-supplied key
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  request_method VARCHAR(10) NOT NULL,
  request_path VARCHAR(500) NOT NULL,
  request_path_hash VARCHAR(128) NOT NULL,          -- hash of request path
  request_body_hash VARCHAR(128) NOT NULL,          -- detect conflicting body on key reuse
  response_status INT,
  response_body JSON,
  status ENUM('processing','completed','failed') NOT NULL DEFAULT 'processing',
  locked_until TIMESTAMP(6),
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  expires_at TIMESTAMP(6) NOT NULL,
  UNIQUE KEY uq_idempotency_tenant (company_id, user_id, request_method, request_path_hash, key_hash),
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
  -- Per-tenant uniqueness, not global. Two tenants using same key don't collide.
  -- If key reused with different request_body_hash → return 409 CONFLICT.
);

-- ─── BILLING_WEBHOOK_EVENTS ──────────────────────────────────────────────────
CREATE TABLE billing_webhook_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_event_id VARCHAR(200) NOT NULL UNIQUE,   -- Stripe event ID
  event_type VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  received_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  processing_status ENUM('received','processing','processed','failed') NOT NULL DEFAULT 'received',
  processed_at TIMESTAMP(6),
  failure_reason TEXT,
  locked_by VARCHAR(100),
  locked_until TIMESTAMP(6)
);

-- ─── FILE_ATTACHMENTS ────────────────────────────────────────────────────────
CREATE TABLE file_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id BINARY(16) NOT NULL UNIQUE,             -- ULID, used in storage key
  company_id INT NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum VARCHAR(64) NOT NULL,                    -- SHA-256
  storage_key VARCHAR(500) NOT NULL,                -- private/company/{publicId}/attachments/{ulid}/original
  status ENUM('pending','quarantine','clean','rejected','deleted') NOT NULL DEFAULT 'pending',
  uploaded_by_membership_id INT NOT NULL,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  verified_at TIMESTAMP(6),
  FOREIGN KEY (company_id) REFERENCES companies(id),
  UNIQUE KEY uq_file_attachments_company_id_id (company_id, id)   -- composite FK target for link tables
);
-- NOTE: No polymorphic entity_type/entity_id. Use explicit link tables below.
-- NOTE: uploaded_by_membership_id uses company-scoped FK (see actor FK section below).

-- ─── ANIMAL_ATTACHMENTS (explicit link, composite FK) ────────────────────────
CREATE TABLE animal_attachments (
  company_id INT NOT NULL,
  attachment_id INT NOT NULL,
  animal_id INT NOT NULL,
  PRIMARY KEY (attachment_id),
  FOREIGN KEY (company_id, animal_id) REFERENCES animals (company_id, id),
  FOREIGN KEY (company_id, attachment_id)
    REFERENCES file_attachments (company_id, id)
);
-- Similarly: company_logo_attachments, expense_attachments, etc.
-- Each link table uses composite FKs to enforce tenant integrity.

-- ─── DATA_EXPORT_JOBS ────────────────────────────────────────────────────────
CREATE TABLE data_export_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id BINARY(16) NOT NULL UNIQUE,
  company_id INT NOT NULL,
  requested_by_membership_id INT NOT NULL,
  export_type VARCHAR(50) NOT NULL,                 -- 'company', 'farm', 'animals'
  status ENUM('pending','processing','completed','failed','expired') NOT NULL DEFAULT 'pending',
  storage_key VARCHAR(500),
  expires_at TIMESTAMP(6) NOT NULL,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  completed_at TIMESTAMP(6),
  FOREIGN KEY (company_id) REFERENCES companies(id)
  -- requested_by_membership_id uses company-scoped FK (see actor FK section below).
);

-- ─── COMPANY_DELETION_REQUESTS ───────────────────────────────────────────────
CREATE TABLE company_deletion_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  requested_by_membership_id INT NOT NULL,
  reason TEXT,
  status ENUM('requested','exported','legal_hold','approved','purging','completed','cancelled')
    NOT NULL DEFAULT 'requested',
  retention_until TIMESTAMP(6) NOT NULL,               -- minimum retention before purge
  approved_by_membership_id INT,
  approved_at TIMESTAMP(6),
  purged_at TIMESTAMP(6),
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id)
  -- requested_by_membership_id, approved_by_membership_id use company-scoped FKs (see below).
);

-- ─── COMPANY-SCOPED ACTOR FKs (membership references) ────────────────────────
-- Actor columns reference memberships, not global users, to preserve company context.
-- Each requires a composite FK: (company_id, membership_id) → company_users(company_id, id)
--
-- ALTER TABLE farms
--   ADD CONSTRAINT fk_farms_created_by
--     FOREIGN KEY (company_id, created_by_membership_id) REFERENCES company_users(company_id, id),
--   ADD CONSTRAINT fk_farms_deleted_by
--     FOREIGN KEY (company_id, deleted_by_membership_id) REFERENCES company_users(company_id, id);
--
-- ALTER TABLE company_invitations
--   ADD CONSTRAINT fk_invitations_invited_by
--     FOREIGN KEY (company_id, invited_by_membership_id) REFERENCES company_users(company_id, id);
--
-- ALTER TABLE company_security_policies
--   ADD CONSTRAINT fk_security_policies_updated_by
--     FOREIGN KEY (company_id, updated_by_membership_id) REFERENCES company_users(company_id, id);
--
-- ALTER TABLE file_attachments
--   ADD CONSTRAINT fk_attachments_uploaded_by
--     FOREIGN KEY (company_id, uploaded_by_membership_id) REFERENCES company_users(company_id, id);
--
-- ALTER TABLE data_export_jobs
--   ADD CONSTRAINT fk_exports_requested_by
--     FOREIGN KEY (company_id, requested_by_membership_id) REFERENCES company_users(company_id, id);
--
-- ALTER TABLE company_deletion_requests
--   ADD CONSTRAINT fk_deletion_requested_by
--     FOREIGN KEY (company_id, requested_by_membership_id) REFERENCES company_users(company_id, id),
--   ADD CONSTRAINT fk_deletion_approved_by
--     FOREIGN KEY (company_id, approved_by_membership_id) REFERENCES company_users(company_id, id);
--
-- All FKs must define ON DELETE behavior explicitly (typically SET NULL for actor columns).

-- ─── PLATFORM_ADMINS (separate from users.role) ──────────────────────────────
CREATE TABLE platform_admins (
  user_id INT PRIMARY KEY,
  role ENUM('platform_admin','platform_support') NOT NULL DEFAULT 'platform_admin',
  granted_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
  granted_by INT,                                   -- user_id of granting admin
  revoked_at TIMESTAMP(6),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
-- NOTE: Replaces users.role for platform-level authorization.
--   Legacy users.role must be fully deprecated and removed from tenant authorization paths.
--   Keeping users.role while legacy code references it creates privilege-escalation risk.
--   Platform role must never be derived from OAuth provider metadata.
```

### Existing table modifications

Add `companyId INT` and `public_id BINARY(16) UNIQUE` to all 24 tenant-scoped tables. Add `farmId` (NOT NULL or nullable per §3). Add composite unique keys on `(company_id, id)` for composite FK targets.

### Users table changes

```sql
ALTER TABLE users ADD COLUMN email_normalized VARCHAR(320);   -- canonical lowercase, UNIQUE
ALTER TABLE users ADD COLUMN primary_email_identity_id INT;   -- FK to user_identities (composite, ensures same user)
ALTER TABLE users ADD COLUMN auth_version INT NOT NULL DEFAULT 1;  -- bumped on password change/MFA reset
ALTER TABLE users ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMP(6);
ALTER TABLE users ADD COLUMN last_password_change TIMESTAMP(6);
-- NOTE: No email_verified on users — derived from primary_email_identity_id's
--   provider_email_verified. Single source of truth.
-- NOTE: No password_hash/mfa fields on users — in password_credentials/mfa_credentials.
-- NOTE: Email normalization: trim + domain normalization + controlled case handling.
--   Do NOT perform provider-specific transformations (e.g., removing Gmail dots/+tags).
-- NOTE: users.role is DEPRECATED — replaced by platform_admins table for platform-level
--   authorization and company_users.role for tenant-level authorization.
--   Legacy users.role must be fully removed from all authorization paths.
-- NOTE: primary_email_identity_id uses a composite FK ensuring the identity belongs to the same user:
--   ALTER TABLE users ADD UNIQUE KEY uq_users_id_id (id, primary_email_identity_id);
--   ALTER TABLE users ADD CONSTRAINT fk_users_primary_identity
--     FOREIGN KEY (id, primary_email_identity_id) REFERENCES user_identities (user_id, id);
-- NOTE: email_normalized UNIQUE must be reconciled with "never auto-link accounts."
--   Registration using an email already attached to an OAuth account must enter a
--   secure account-link/recovery flow rather than creating another user or auto-linking.
```

`users.role` is **deprecated** — replaced by `platform_admins` table for platform-level authorization and `company_users.role` for tenant-level authorization. Legacy `users.role` must be fully removed from all authorization paths to prevent privilege escalation.

### Audit log changes

```sql
ALTER TABLE audit_log
  ADD COLUMN company_id INT,                        -- nullable initially, backfilled, then NOT NULL
  ADD COLUMN farm_id INT,
  ADD COLUMN action_category ENUM(
    'auth','crud','config','membership','billing',
    'security','data_export','data_delete','company'
  ),                                               -- nullable initially, backfilled, then NOT NULL
  ADD COLUMN membership_id INT,                     -- actor's membership (preserves company context)
  ADD COLUMN session_id INT,
  ADD COLUMN request_id VARCHAR(50),
  ADD COLUMN outcome ENUM('success','denied','error') NOT NULL DEFAULT 'success';
-- NOTE: company_id AND action_category follow nullable → dual-write → backfill → NOT NULL migration.
--   Adding action_category as NOT NULL would fail on existing rows with no value.
```

### Role permissions changes

```sql
ALTER TABLE role_permissions
  ADD COLUMN company_id INT,                        -- nullable initially, backfilled, then NOT NULL
  ADD COLUMN effect ENUM('allow','deny') NOT NULL DEFAULT 'allow',
  ADD UNIQUE KEY uq_role_permissions_active (company_id, role, resource, action);
-- NOTE: Unique key does NOT include 'effect' — that would allow both an allow
--   and deny row for the same role/action combination, which is confusing.
--   effect is the value being configured, not part of the identity.
-- NOTE: 'page' renamed to 'resource', 'action' stays.
-- NOTE: company_id follows nullable → dual-write → backfill → NOT NULL migration.
```

### Composite foreign keys (database-enforced tenant integrity)

Every tenant relationship uses a composite FK containing `company_id`. This prevents an app bug from connecting an animal in Company A to a farm/group/category in Company B.

```sql
-- Composite unique keys (FK targets)
ALTER TABLE farms               ADD UNIQUE KEY uq_farms_company_id_id (company_id, id);
ALTER TABLE animal_categories   ADD UNIQUE KEY uq_categories_company_id_id (company_id, id);
ALTER TABLE species             ADD UNIQUE KEY uq_species_company_id_id (company_id, id);
ALTER TABLE animal_statuses     ADD UNIQUE KEY uq_statuses_company_id_id (company_id, id);
ALTER TABLE groups              ADD UNIQUE KEY uq_groups_company_id_id (company_id, id);
ALTER TABLE owners              ADD UNIQUE KEY uq_owners_company_id_id (company_id, id);
ALTER TABLE birth_types         ADD UNIQUE KEY uq_birth_types_company_id_id (company_id, id);
ALTER TABLE feed_items          ADD UNIQUE KEY uq_feed_items_company_id_id (company_id, id);
ALTER TABLE vaccines            ADD UNIQUE KEY uq_vaccines_company_id_id (company_id, id);
ALTER TABLE expense_categories  ADD UNIQUE KEY uq_expense_cats_company_id_id (company_id, id);
ALTER TABLE expense_sub_categories ADD UNIQUE KEY uq_expense_subcats_company_id_id (company_id, id);

-- Composite foreign keys (enforce tenant integrity)
ALTER TABLE animals
  ADD CONSTRAINT fk_animals_farm
    FOREIGN KEY (company_id, farm_id) REFERENCES farms (company_id, id),
  ADD CONSTRAINT fk_animals_category
    FOREIGN KEY (company_id, category_id) REFERENCES animal_categories (company_id, id),
  ADD CONSTRAINT fk_animals_species
    FOREIGN KEY (company_id, species_id) REFERENCES species (company_id, id),
  ADD CONSTRAINT fk_animals_status
    FOREIGN KEY (company_id, status_id) REFERENCES animal_statuses (company_id, id),
  ADD CONSTRAINT fk_animals_group
    FOREIGN KEY (company_id, group_id) REFERENCES groups (company_id, id),
  ADD CONSTRAINT fk_animals_owner
    FOREIGN KEY (company_id, owner_id) REFERENCES owners (company_id, id);

ALTER TABLE lambing_log
  ADD CONSTRAINT fk_lambing_dam
    FOREIGN KEY (company_id, dam_id) REFERENCES animals (company_id, id),
  ADD CONSTRAINT fk_lambing_sire
    FOREIGN KEY (company_id, sire_id) REFERENCES animals (company_id, id),
  ADD CONSTRAINT fk_lambing_farm
    FOREIGN KEY (company_id, farm_id) REFERENCES farms (company_id, id);
  -- farm_id is an immutable snapshot set at lambing time, not derived from animal's current farm.

ALTER TABLE vaccination_records
  ADD CONSTRAINT fk_vaccination_animal
    FOREIGN KEY (company_id, animal_id) REFERENCES animals (company_id, id),
  ADD CONSTRAINT fk_vaccination_vaccine
    FOREIGN KEY (company_id, vaccine_id) REFERENCES vaccines (company_id, id),
  ADD CONSTRAINT fk_vaccination_farm
    FOREIGN KEY (company_id, farm_id) REFERENCES farms (company_id, id);
  -- farm_id is an immutable snapshot set at vaccination time.

ALTER TABLE weight_log
  ADD CONSTRAINT fk_weight_animal
    FOREIGN KEY (company_id, animal_id) REFERENCES animals (company_id, id),
  ADD CONSTRAINT fk_weight_farm
    FOREIGN KEY (company_id, farm_id) REFERENCES farms (company_id, id);
  -- farm_id is an immutable snapshot set at weigh-in time.

ALTER TABLE sales
  ADD CONSTRAINT fk_sales_animal
    FOREIGN KEY (company_id, animal_id) REFERENCES animals (company_id, id),
  ADD CONSTRAINT fk_sales_farm
    FOREIGN KEY (company_id, farm_id) REFERENCES farms (company_id, id);
  -- farm_id is an immutable snapshot set at sale time.

ALTER TABLE animal_status_history
  ADD CONSTRAINT fk_status_history_animal
    FOREIGN KEY (company_id, animal_id) REFERENCES animals (company_id, id),
  ADD CONSTRAINT fk_status_history_farm
    FOREIGN KEY (company_id, farm_id) REFERENCES farms (company_id, id);
  -- farm_id is an immutable snapshot set at status change time.

ALTER TABLE feed_stock_ledger
  ADD CONSTRAINT fk_feed_stock_farm
    FOREIGN KEY (company_id, farm_id) REFERENCES farms (company_id, id),
  ADD CONSTRAINT fk_feed_stock_item
    FOREIGN KEY (company_id, feed_item_id) REFERENCES feed_items (company_id, id);

ALTER TABLE ration_plans
  ADD CONSTRAINT fk_ration_category
    FOREIGN KEY (company_id, category_id) REFERENCES animal_categories (company_id, id),
  ADD CONSTRAINT fk_ration_feed_item
    FOREIGN KEY (company_id, feed_item_id) REFERENCES feed_items (company_id, id);

ALTER TABLE expenses
  ADD CONSTRAINT fk_expense_category
    FOREIGN KEY (company_id, category_id) REFERENCES expense_categories (company_id, id),
  ADD CONSTRAINT fk_expense_sub_category
    FOREIGN KEY (company_id, sub_category_id) REFERENCES expense_sub_categories (company_id, id),
  ADD CONSTRAINT fk_expense_head
    FOREIGN KEY (company_id, head_id) REFERENCES animals (company_id, id);

ALTER TABLE role_permissions
  ADD CONSTRAINT fk_role_permissions_company
    FOREIGN KEY (company_id) REFERENCES companies (id);
-- Apply equivalent composite FKs to all remaining relationships.
-- Define ON DELETE behavior explicitly for all FKs. Do not rely on defaults.
```

### Per-tenant unique constraints with soft-delete safety

MySQL unique indexes permit multiple NULL values. Use generated columns:

```sql
ALTER TABLE species
  ADD COLUMN active_normalized_name VARCHAR(200)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN LOWER(TRIM(name)) ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_species_active_name (company_id, active_normalized_name);

ALTER TABLE animal_statuses
  ADD COLUMN active_normalized_name VARCHAR(200)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN LOWER(TRIM(name)) ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_statuses_active_name (company_id, active_normalized_name);

ALTER TABLE birth_types
  ADD COLUMN active_normalized_name VARCHAR(200)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN LOWER(TRIM(name)) ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_birth_types_active_name (company_id, active_normalized_name);

ALTER TABLE feed_items
  ADD COLUMN active_normalized_name VARCHAR(200)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN LOWER(TRIM(name)) ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_feed_items_active_name (company_id, active_normalized_name);

ALTER TABLE vaccines
  ADD COLUMN active_normalized_name VARCHAR(200)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN LOWER(TRIM(name)) ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_vaccines_active_name (company_id, active_normalized_name);

ALTER TABLE expense_categories
  ADD COLUMN active_normalized_name VARCHAR(200)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN LOWER(TRIM(name)) ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_expense_cats_active_name (company_id, active_normalized_name);

ALTER TABLE groups
  ADD COLUMN active_normalized_code VARCHAR(20)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN UPPER(TRIM(group_code)) ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_groups_active_code (company_id, active_normalized_code);

ALTER TABLE animals
  ADD COLUMN active_animal_id VARCHAR(20)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN animal_id ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_animals_active_id (company_id, active_animal_id);

ALTER TABLE lambing_log
  ADD COLUMN active_lamb_id VARCHAR(20)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN lamb_id ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_lambing_active_id (company_id, active_lamb_id);

ALTER TABLE system_settings
  ADD COLUMN active_setting_key VARCHAR(100)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN setting_key ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_settings_active_key (company_id, active_setting_key);

-- farms: soft-delete-safe code uniqueness
ALTER TABLE farms
  ADD COLUMN active_normalized_code VARCHAR(20)
    GENERATED ALWAYS AS (
      CASE WHEN deleted_at IS NULL THEN UPPER(TRIM(code)) ELSE NULL END
    ) STORED,
  ADD UNIQUE KEY uq_farms_active_code (company_id, active_normalized_code);
-- Drop the old UNIQUE(company_id, code) which blocks code reuse after soft-delete.

-- Apply same review to every soft-deletable table with a unique constraint.
```

### Opaque public identifiers

All tenant-scoped tables get `public_id BINARY(16) NOT NULL UNIQUE` (ULID). Use this for:
- URLs: `/c/{companySlug}/animals/{publicId}`
- API resource identifiers
- File storage keys
- Invitations, exports, deletion requests

Internal integer keys remain for joins. Sequential DB IDs are never exposed as public resource identifiers.

### Index strategy

Composite indexes on every high-traffic table: `(company_id, deleted_at)`, `(company_id, farm_id)`, `(company_id, <foreign_id>, deleted_at)`.

---

## 5. Session & Tenant Resolution

### Architecture: Opaque server-side sessions + route-based tenant context

```
┌─────────────────────────────────────────────────────────────────┐
│                        REQUEST FLOW                              │
│                                                                  │
│  Cookie: __Host-lfms_session=<opaque 256-bit random value>      │
│  Route:  /c/{companySlug}/animals                                │
│     │                                                            │
│     ▼                                                            │
│  ┌──────────────┐     ┌─────────────────┐    ┌───────────────┐  │
│  │ Hash token   │────▶│ Look up session │───▶│ Load user     │  │
│  │ SHA-256      │     │ by session_id_  │    │ by user_id    │  │
│  │ + pepper     │     │ hash            │    │               │  │
│  └──────────────┘     └─────────────────┘    └───────┬───────┘  │
│                               │                        │        │
│                               │ check:                 │        │
│                               │ - not revoked          │        │
│                               │ - idle not expired     │        │
│                               │ - absolute not expired │        │
│                               │ - user_auth_version    │        │
│                               │   matches users table  │        │
│                               ▼                        ▼        │
│                      ┌────────────────┐    ┌────────────────┐   │
│                      │ Resolve company│    │ Load memberships│  │
│                      │ from ROUTE     │    │ company_users   │  │
│                      │ (not session)  │    │ + farm access   │  │
│                      └───────┬────────┘    └───────┬────────┘   │
│                              │                     │            │
│                              ▼                     ▼            │
│                      ┌────────────────────────────────────┐    │
│                      │ Validate:                          │    │
│                      │ - membership active                │    │
│                      │ - company not suspended            │    │
│                      │ - authorization_version matches    │    │
│                      │ - MFA policy satisfied             │    │
│                      └───────────┬────────────────────────┘    │
│                                  ▼                              │
│                      ┌────────────────────────────────────┐    │
│                      │ ctx: TenantContext = {             │    │
│                      │   companyId,                       │    │
│                      │   membershipId,                    │    │
│                      │   userId,                          │    │
│                      │   membershipRole,                  │    │
│                      │   accessibleFarmIds | "all",       │    │
│                      │   permissionOverrides,             │    │
│                      │   authLevel,                       │    │
│                      │   sessionId,                       │    │
│                      │ }                                  │    │
│                      └────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Cookie settings

```
__Host-lfms_session=<opaque 256-bit random value>
  HttpOnly
  Secure
  SameSite=Lax
  Path=/
  No Domain attribute (Host-prefixed cookie)
```

Opaque session cookie does not require cookie signing; the random token + server-side hash lookup provides integrity. Add a server-side pepper to the hash for defense-in-depth.

### Route-based tenant context (authoritative)

Company is resolved from the route (`/c/{companySlug}/...`) on **every request**. The selector is accepted from the request but **never trusted without membership validation**.

- **No `company_id` in sessions for authorization.** `sessions.last_selected_company_id` is a UX preference only, never used for authorization.
- **No automatic fallback** to "first active membership." If no company selected or membership invalid → return `COMPANY_SELECTION_REQUIRED`.
- **No session rotation when navigating between companies.** Multiple browser tabs can show different companies safely — each request carries its own route context.
- **Never mutate cookies inside `createContext`.**

### Company switching (UX preference only)

```
POST /api/preferences/last-company
  Body: { companySlug: string }
  Auth: required + CSRF token
  Logic:
    1. Verify user has active membership in target company
    2. Update sessions.last_selected_company_id (UX preference)
    3. Do NOT rotate session
    4. Do NOT change security context of other tabs
  Security:
    - This is a preference endpoint, not a security context switch
    - The actual tenant context is always derived from the route
```

### Farm switching

NOT in JWT or session. Sent as query parameter. Backend validates:
1. Farm exists in `ctx.companyId` (lookup with `company_id` filter — never global lookup)
2. User's `farm_access_mode` + `company_user_farms` allows this farm
3. Response codes:
   - **404**: farm does not exist in the selected tenant or belongs to another tenant
   - **403**: farm exists in the selected tenant but membership is not assigned to it
   - **400**: malformed farm identifier or invalid request format
   - **Never** perform a global farm lookup first — that reveals whether another tenant's farm exists.

### Session record fields

```
session_id_hash              -- SHA-256(opaque_token + server_pepper)
user_id
last_selected_company_id     -- UX preference ONLY, never for authorization
authentication_level         -- 'partial' (no MFA) or 'full' (MFA verified)
mfa_verified_at
authentication_methods       -- JSON array: ["password","totp"]
user_auth_version            -- compared against users.auth_version on every request
created_at
last_seen_at                 -- throttled: update once every 5 minutes
idle_expires_at              -- 30 min idle timeout
absolute_expires_at          -- 7 day absolute max
revoked_at
ip_address                   -- risk signal, not hard binding
user_agent                   -- risk signal, not hard binding
```

### Auth version system (authoritative invalidation)

```sql
-- On users table:
ALTER TABLE users ADD COLUMN auth_version INT NOT NULL DEFAULT 1;

-- On company_users table:
ALTER TABLE company_users ADD COLUMN authorization_version INT NOT NULL DEFAULT 1;
```

Rules:
- **Password change, MFA reset, account compromise**: increment `users.auth_version` → all sessions with `user_auth_version < current` are invalid.
- **Membership role, status, or farm access change**: increment `company_users.authorization_version`. Since membership is loaded per request, role changes take effect immediately without invalidating every session.
- A role change in Company A does **not** log the user out of Company B.
- Session stores `user_auth_version` (compared against `users.auth_version` on each request).

### Session lifecycle

| Event | Action |
|-------|--------|
| Login | Create session record, set cookie |
| Idle timeout | `last_seen_at + 30min < now` → revoke |
| Absolute timeout | `created_at + 7d < now` → revoke |
| Password change | Increment `users.auth_version` → sessions with old version invalid |
| MFA reset | Increment `users.auth_version` → sessions invalid |
| Role change | Increment `company_users.authorization_version` → takes effect immediately (membership loaded per request) |
| Logout | Revoke session record |
| Logout-all-devices | Revoke all sessions for user |
| Max sessions | 5 per user (configurable) — oldest revoked when exceeded |

### Session read consistency

Session reads must use the **primary database** or a strongly consistent cache, not a lagging read replica. A lagging replica could serve a revoked session as valid.

---

## 6. Authentication Architecture

### Identity separation

```
users
  id
  email_normalized (canonical lowercase, UNIQUE)
  primary_email_identity_id (FK to user_identities)
  name
  auth_version
  created_at

user_identities
  user_id
  provider ('password', 'google', 'apple', 'microsoft', 'github', 'manus')
  provider_subject (openId for OAuth, NULL for password)
  provider_email
  provider_email_verified
  UNIQUE(provider, provider_subject)
  UNIQUE(user_id, provider)

password_credentials
  user_id
  password_hash (argon2id)
  password_changed_at
  password_needs_rehash
```

**Email verification single source of truth**: `users.email_verified` is **removed**. The user's effective email verification status is derived from `user_identities.provider_email_verified` of the `primary_email_identity_id`. No duplicate `email_verified` column on `users`.

**Email normalization**: trim + domain normalization + controlled case handling. Do NOT perform provider-specific transformations (e.g., removing Gmail dots or `+tags`).

**Critical rule**: Never automatically link OAuth and password accounts because email strings match. Linking requires:
1. Verified provider email
2. Reauthentication of the existing account
3. Explicit user action

**Registration with existing email**: If a user registers with email/password and `email_normalized` already exists (attached to an OAuth account), do NOT create another user or auto-link. Instead, enter a **secure account-link/recovery flow**: verify the email, require reauthentication of the existing account, then link the new identity.

**Authentication token identity binding**: `authentication_tokens.user_identity_id` binds verification tokens to a specific identity (NOT just `user_id`). This ensures the correct identity is verified, particularly for `verify_email` and `identity_link` purposes.

**TOTP replay prevention**: `last_used_totp_step` must be updated **atomically** during TOTP validation: `UPDATE mfa_credentials SET last_used_totp_step = ? WHERE id = ? AND last_used_totp_step < ?`. If the update affects 0 rows, the code was already used — reject.

**WebAuthn scope**: v1 supports TOTP only. WebAuthn requires a separate table with `credential_id`, `public_key`, `sign_counter`, `transports`, `rp_id`, `rp_name`. Do not include `webauthn` in the `mfa_credentials.method` enum until that table exists.

### Email/Password flows

- **Register**: validate email + password (min 15 chars, max 64, no composition rules, check compromised-password blocklist) → argon2id hash → create user → create `user_identities` (provider='password') → create `password_credentials` → create company (trial, +14d) → create `company_users` (owner) → create default farm → seed reference data → insert outbox event (encrypted payload) for verification email → commit transaction → return session
- **Login**: load user by `email_normalized` → check lock → verify argon2id (rehash if needed) → check MFA if enabled → reset attempts → load memberships → create session → return cookie. Generic response (no account enumeration).
- **Forgot password**: generate token → store SHA-256 hash in `authentication_tokens` → 1h expiry → insert outbox event (encrypted payload) for email → commit. Generic response (don't reveal if email exists).
- **Reset password**: verify token hash from `authentication_tokens` → check not expired/used → update `password_credentials` → increment `users.auth_version` → mark token used → audit log
- **Verify email**: hash token from `authentication_tokens` → set `user_identities.provider_email_verified=true` → mark token used → redirect

### OAuth security

- `state` parameter with CSRF token
- PKCE for authorization code flow
- OIDC `nonce` for ID token validation
- Exact redirect URI allowlist (no wildcards)
- Reauthentication before identity linking/unlinking
- Platform role must never be derived from OAuth provider metadata

### MFA architecture

**Enrollment belongs to the user. Enforcement belongs to the company.**

```
company_security_policies
  company_id
  require_mfa
  allowed_mfa_methods
  privileged_session_max_age
  require_mfa_for_owners
  require_mfa_for_billing
  require_mfa_for_data_export

mfa_credentials
  user_id
  method ('totp', 'webauthn')
  encrypted_secret (envelope-encrypted BLOB)
  encryption_key_version
  last_used_totp_step (prevents replay within same TOTP window)
  enabled_at
  disabled_at

mfa_recovery_codes
  mfa_credential_id
  code_hash (argon2id)
  used_at
```

Session records `mfa_verified_at` and `authentication_methods`. When switching into a company requiring MFA, require **step-up authentication** before granting access.

**MFA required for**: company owners, platform admins, billing changes, ownership transfer, data exports, API-key creation, disabling MFA.

TOTP secrets: envelope-encrypted with key versioning. `last_used_totp_step` prevents replaying the same TOTP code during its validity window. Backup codes: argon2id hashed, single-use.

### Password policy (NIST SP 800-63B aligned)

| Rule | Value |
|------|-------|
| Min length | 15 chars (when MFA not mandatory) |
| Max length | ≥ 64 chars |
| Composition rules | None (no forced uppercase/symbol) |
| Compromised-password check | Yes (HaveIBeenPwned API or local blocklist) |
| Hashing | argon2id (benchmarked memory/time, rehash-on-login) |
| Account enumeration | Generic login/reset responses |

### Lockout policy (progressive, not attacker-triggerable)

| Trigger | Response |
|---------|----------|
| 5 failed attempts | Progressive delay: 1min, 2min, 5min, 10min, 30min |
| 10 failed attempts | Lock 1 hour |
| Combined limits | Rate limit by IP, account, device/session, and network range |
| Lock reset | Successful login resets counter |

Avoid simple attacker-triggerable 24-hour lock (DoS via intentional lockout).

### Brute-force protection

10 auth req/min per IP. 3 reset reqs/hour per email. Combined limits by IP, account, device/session, and network range.

---

## 7. Authorization & RBAC

### Permission precedence (deny-by-default, deterministic)

```
Platform restriction
  → company restriction
    → membership/security checks
      → any applicable explicit deny
        → any applicable explicit allow
          → baseline role decision
            → default deny
              → farm scope
                → object/state rules
```

Evaluation is **not** "first matching rule wins" — it is layered: all deny rules are checked first, then all allow rules, then baseline, then default deny. This means a deny at any level always wins over any allow. There is no ambiguity between "deny always wins" and "first match wins."

### Permission schema (with explicit deny)

```sql
role_permissions
  company_id
  role
  resource          -- renamed from 'page'
  action
  effect ENUM('allow', 'deny')
  UNIQUE(company_id, role, resource, action)
```

The unique key does **NOT** include `effect`. Including `effect` would allow both an `allow` and `deny` row for the same role/action combination, which is unnecessary and confusing. `effect` is the value being configured, not part of the row identity.

Permission levels:
1. **Baseline role permissions** — hardcoded defaults per role
2. **Company overrides** — `role_permissions` with `company_id`, can allow or deny
3. **User-level overrides** — if needed, `user_permissions` table (future)

### Permission caching with versioning

Cache key: `perm:{companyId}:{permissionsVersion}:{role}`

Increment `permissionsVersion` (stored on `companies` or a dedicated `company_permission_versions` table) whenever role permissions change. Without versioning, a newly added deny may not take effect immediately from cache.

### Company-wide data visibility clarification

"Company-wide data is visible regardless of farm access" means visible regardless of **farm assignment**, NOT regardless of **RBAC permission**. A restricted-farm user with `viewer` role still needs the appropriate RBAC permission to view company-wide resources. Farm access controls which farm-scoped records are visible; RBAC controls which actions are permitted at all.

### Authorization response codes

| Code | When |
|------|------|
| `401` | Unauthenticated or invalid session |
| `403` | Authenticated but lacks permission within a known accessible tenant |
| `404` | Requested object does not exist OR is outside caller's accessible tenant scope |
| `403 COMPANY_SUSPENDED` | Subscription or administrative restriction |
| `403 COMPANY_SELECTION_REQUIRED` | No active company selected |
| `403 MFA_REQUIRED` | Step-up authentication needed |

### Three-layer authorization

1. **Tenant isolation**: `ctx.companyId` → `WHERE company_id = ?` on every query
2. **Role-based access**: `ctx.membershipRole` (from `company_users`) → role rank check
3. **Permission matrix**: per-company `role_permissions` with allow/deny → `hasPermission()`

### `TenantContext` type (compile-time enforcement)

```typescript
type TenantContext = Readonly<{
  companyId: CompanyId;
  membershipId: CompanyMembershipId;
  userId: UserId;
  membershipRole: AppRole;
  accessibleFarmIds: readonly FarmId[] | "all";
  farmAccessMode: "all" | "restricted";
  permissionOverrides: PermissionOverrides;
  authLevel: "partial" | "full";
  sessionId: SessionId;
}>;

// ALL repository methods take TenantContext, never bare companyId:
getAnimals(ctx: TenantContext, filters: AnimalFilters): Promise<Animal[]>
createAnimal(ctx: TenantContext, command: CreateAnimalCommand): Promise<Animal>
```

### `companyProcedure` (new base middleware)

Replaces `protectedProcedure` for all tenant-scoped endpoints. Rejects if:
- No `ctx.user` → 401
- No `ctx.companyId` → 403 `COMPANY_SELECTION_REQUIRED`
- Company suspended → 403 `COMPANY_SUSPENDED`
- MFA policy not satisfied → 403 `MFA_REQUIRED`

### Bootstrap endpoints (partial session access)

Registration creates an owner with a partial session (`authentication_level='partial'`). If `companyProcedure` rejects with `MFA_REQUIRED`, the new user cannot access onboarding to enroll MFA — a deadlock.

Define **bootstrap endpoints** available to partial sessions:
```
/auth/verify-email
/auth/mfa/enroll
/auth/mfa/confirm
/auth/recovery-codes
/auth/logout
```

Until email verification and required MFA are complete:
- **Block** all tenant mutations except required onboarding/security actions
- **Allow** only the bootstrap endpoints above
- After verification + MFA enrollment, session upgrades to `authentication_level='full'`

### Role hierarchy management rules

- Admin cannot manage an owner
- Admin cannot promote anyone to owner
- Admin should not disable another admin unless explicitly allowed
- Users cannot change their own role or farm access
- Ownership transfer requires recent MFA/re-authentication
- Platform roles cannot be assigned from tenant endpoints
- Platform role must never be derived from OAuth provider metadata

### Platform/system authorization context

Normal repositories require `TenantContext`, which is correct. But billing jobs, platform administration, tenant creation, usage reconciliation, and scheduled iteration across companies need controlled cross-tenant access. Do not let these services bypass tenant repositories arbitrarily.

```typescript
type PlatformContext = Readonly<{
  actorType: "platform-admin" | "system-job";
  actorId: string;
  reason: string;
  requestId: string;
}>;
```

Create narrowly scoped platform repositories:
```
platformCompanyRepository    -- company CRUD, lifecycle status changes
billingRepository            -- subscription management, webhook processing
tenantProvisioningRepository -- new tenant creation, seeding
systemJobRepository          -- usage reconciliation, scheduled iteration
```

Requirements:
- **Never accepted from a public tenant endpoint** — only internal system jobs and platform admin UI
- **Separate middleware and authorization** — not `companyProcedure`
- **Every operation audited** in the security audit stream
- **System jobs use dedicated identities** — not user accounts
- **No generic "query any tenant table" function** — each repository has narrow, specific methods
- **Platform-admin access requires recent MFA and a justification**
- `users.role` is deprecated — use `platform_admins` table for platform-level authorization

---

## 8. Tenant Isolation Enforcement

### Defense-in-depth: 5 layers

1. **tRPC middleware** (`companyProcedure`): reject no-tenant/suspended/no-MFA
2. **Router input validation**: `farmId` from input validated against `ctx.companyId` + farm access
3. **Repository layer**: every method takes `TenantContext`, every WHERE includes `company_id` + farm scope
4. **Database constraints**: composite foreign keys prevent cross-company relationships
5. **CI gate**: ESLint/AST rule + integration tests + mutation tests

### Farm scope enforcement (critical — no data leakage)

**For farm-scoped resources** (`animals`, `groups`, `feed_stock_ledger`, and derived records), absence of `farmId` must NOT mean access to all company data.

```typescript
function applyFarmScope(
  conditions: SQL[],
  ctx: TenantContext,
  farmColumn: Column,
  requestedFarmId?: FarmId,
): void {
  if (ctx.farmAccessMode === "all") {
    if (requestedFarmId) {
      assertFarmInCompany(ctx, requestedFarmId);
      conditions.push(eq(farmColumn, requestedFarmId));
    }
    // No farmId = all farms (user has 'all' access)
    return;
  }

  // Restricted user
  if (requestedFarmId) {
    assertFarmAccess(ctx, requestedFarmId);  // 403 if not assigned
    conditions.push(eq(farmColumn, requestedFarmId));
  } else {
    // No farmId for restricted user = all ASSIGNED farms, NOT all company farms
    conditions.push(inArray(farmColumn, ctx.accessibleFarmIds));
  }
}
```

**For company-wide resources** (species, categories, statuses, vaccines, etc.): no farm scope needed — visible to all users in the company.

### Repository pattern (explicit command types, no mass assignment)

```typescript
// Explicit command types — never Partial<Animal>
type UpdateAnimalCommand = {
  name?: string;
  categoryPublicId?: string;
  statusPublicId?: string;
  birthDate?: string;
  notes?: string;
  // NEVER includes: companyId, publicId, createdBy, deletedAt, animalId, etc.
};

// Farm movement is a separate operation:
moveAnimal(ctx: TenantContext, animalPublicId: string, targetFarmPublicId: string): Promise<void>

// Deletion/restoration are separate operations:
archiveAnimal(ctx: TenantContext, animalPublicId: string): Promise<void>
restoreAnimal(ctx: TenantContext, animalPublicId: string): Promise<void>

// Query with tenant + farm scope:
export async function getAnimals(ctx: TenantContext, filters?: AnimalFilters) {
  const conditions = [eq(animals.companyId, ctx.companyId), isNull(animals.deletedAt)];
  applyFarmScope(conditions, ctx, animals.farmId, filters?.farmId);
  // ... other filters
  return db.select().from(animals).where(and(...conditions));
}

// Mutation with tenant + farm scope ownership check:
export async function updateAnimal(
  ctx: TenantContext,
  animalPublicId: string,  // use public_id, not internal id
  command: UpdateAnimalCommand,
) {
  // Query with ALL tenant predicates — never by id alone
  const existing = await db.select()
    .from(animals)
    .where(and(
      eq(animals.publicId, animalPublicId),
      eq(animals.companyId, ctx.companyId),
      allowedFarmCondition(ctx, animals.farmId),
      isNull(animals.deletedAt),
    ))
    .limit(1);

  if (!existing[0]) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return db.update(animals).set(command)
    .where(and(
      eq(animals.id, existing[0].id),
      eq(animals.companyId, ctx.companyId),
    ));
}
```

### CI enforcement (beyond text scan)

- **Custom ESLint/AST rule**: ban direct table access (`.select().from(...)`, `.insert()`, `.update()`, `.delete()`) outside approved repository modules in `server/repository/`
- **Raw SQL allowlist**: any `sql\`...\`` template must be reviewed and allowlisted
- **Cross-tenant integration tests**: for every endpoint, company A user vs company B data
- **Mutation tests**: remove a `companyId` predicate from a query → CI must fail
- **Tests for**: caches, exports, queues, scheduled jobs, imports, files, reports

### Information leak prevention

- Cross-tenant access → **404 NOT_FOUND** (object doesn't exist in your scope)
- Permission denied within tenant → **403 FORBIDDEN** (you can see it but can't do that)
- Generic error messages (no "belongs to another company")
- No count leakage in list endpoints
- Audit logs company-scoped
- Never perform a global lookup first (e.g., farm lookup without company_id filter) — that reveals whether another tenant's resource exists

---

## 9. Company Registration & Onboarding

### Registration flow (transactional + outbox)

```
Transaction:
  1. Create user (email_normalized, primary_email_identity_id=null initially)
  2. Create user_identities (provider='password', provider_email_verified=false)
  3. Create password_credentials (argon2id hash)
  4. Update user.primary_email_identity_id = identity.id
  5. Create company (lifecycle_status='active', slug)
  6. Create company_users (role='owner', status='active', farm_access_mode='all')
  7. Create company_security_policies (defaults)
  8. Create company_subscriptions (provider_status='trialing', trial_ends_at=+14d, is_current=true)
  9. Create company_usage_current (zeroed)
  10. Create default farm
  11. Seed reference data (species, categories, statuses, vaccines, etc.)
  12. Create authentication_tokens (purpose='verify_email', token_hash, expires_at)
  13. Insert outbox event: 'email.verification' with encrypted_payload containing raw token
Commit

Worker (async):
  14. Pick up outbox event (claim with locked_by + locked_until)
  15. Decrypt payload, deliver verification email
  16. Delete/erase encrypted payload after sending
  17. Mark event as 'sent'
```

**Never send email while the DB transaction is open.** Use the outbox pattern for all email, notifications, audit forwarding, and billing actions. **Never store raw tokens in plaintext JSON payload** — use `encrypted_payload` with envelope encryption.

### Onboarding wizard

1. Company profile (name, logo, currency, language)
2. Farm setup (name, location, timezone)
3. Reference data review (confirm/adjust seeded data)
4. Invite team (optional)
5. Import data (optional, Excel import scoped to companyId)
6. Complete → dashboard

### Slug generation

`name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').substring(0, 100)`. Check reserved names (api, admin, www, app, auth, billing). On collision: append `-2`, `-3`.

### Seed routine

Clone default templates into company-scoped rows. Each insert sets `company_id`. Uses composite FKs to ensure all relationships stay within the tenant.

---

## 10. Multi-Farm Management

- **Farm CRUD**: admin+ can create/edit/disable; owner can delete (requires zero active animals on farm)
- **Farm switcher**: dropdown in app shell, "All Farms" option, stored in localStorage (NOT in session/JWT)
- **Move animal**: `moveAnimal(ctx, animalPublicId, targetFarmPublicId)` — separate operation, verify both belong to `ctx.companyId`, audit log, transactional
- **Reporting**: Dashboard/P&L/Income Statement default to all farms with per-farm filter; Feed/Fattening/Breeding require farm selection

### Farm access model (explicit, never inferred)

```sql
company_users.farm_access_mode ENUM('all', 'restricted') NOT NULL DEFAULT 'restricted'
```

- `'all'`: user can access all farms in the company. Owners default to this.
- `'restricted'`: user can only access farms in `company_user_farms`. Everyone else defaults to this.
- **Never infer access from absence of rows.** Deleting the last mapping does NOT grant all-farm access.
- For restricted users, "All Farms" means all **assigned** farms, never all company farms.

---

## 11. Membership & Invitations

### Invitation flow (transactional + outbox)

```
Transaction:
  1. Validate inviter is admin+ in company (and cannot manage owners)
  2. Check pending invitation limit (max 10)
  3. Generate token (crypto.randomBytes(32))
  4. Store SHA-256 hash in company_invitations + 7d expiry
  5. Insert outbox event: 'email.invitation' with encrypted_payload containing raw token
Commit

Worker:
  6. Claim event (locked_by + locked_until)
  7. Decrypt payload, send invitation email
  8. Delete/erase encrypted payload
  9. Mark event as 'sent'
```

Acceptance:
```
Transaction:
  1. Hash presented token, look up by hash in company_invitations
  2. Check not expired, not already accepted
  3. Verify email matches (case-insensitive)
  4. Create or find user by email_normalized
  5. Create company_users (status='active')
  6. Mark invitation accepted
  7. Insert audit event
Commit
```

### Security rules

- Token: 256-bit entropy, SHA-256 hashed at rest, single-use, 7d expiry
- Email must match invitation email (case-insensitive)
- Max 10 pending invitations per company
- Only admin+ can invite; cannot invite to `owner` role

### Role management

| Action | Required Role | Notes |
|--------|--------------|-------|
| View members | admin+ | |
| Invite member | admin+ | Cannot invite to owner |
| Change member role | admin+ | Cannot promote to owner; cannot manage owners |
| Disable member | admin+ | Cannot disable self; cannot disable another admin unless explicitly allowed |
| Remove member | admin+ | Cannot remove self's role |
| Transfer ownership | owner | Requires recent MFA/re-authentication; old owner becomes admin; transactional + lock |
| Leave company | any | Blocked if last owner |
| Change own role/farm access | — | **Never allowed** |

### Last-owner protection

Ownership is derived from `company_users.role='owner'` (no `owner_user_id` on companies). Enforced at DB level via generated column `owner_company_guard` (UNIQUE — at most one active owner per company). Application transactions enforce at least one owner (cannot remove last owner). `SELECT ... FOR UPDATE` on `company_users` rows during transfer. Ownership history stored in audit log.

---

## 12. Audit & Compliance

### Append-only enforcement (not just convention)

- **Insert-only DB credentials**: separate DB user with INSERT-only permission on `audit_log`
- **External immutable log destination**: stream to append-only storage (CloudWatch Logs with retention lock, or S3 Object Lock)
- **Hash chaining with concurrency design**: use a per-company chain with a locked chain-head row (not a simple "previous row hash" which races under concurrent inserts). Alternatively, use signed time-batched Merkle roots or an external immutable logging service as the authoritative tamper-evident store.
- **Separate streams**: security audit stream (cross-tenant denials, auth events) separate from business activity logs
- **Redaction**: strip passwords, tokens, secrets, sensitive request bodies before logging
- **Rich context**: actor user, membership, company, farm, request ID, session ID, IP, action, target, outcome

### Cross-tenant denial logging

Cross-tenant access denial attempts go to the **platform security log**, not a tenant-visible log. Never expose another tenant's identifiers in a tenant-visible log.

### Sensitive actions to audit

| Category | Actions |
|----------|---------|
| **Auth** | login, logout, login_failed, password_reset_requested, password_reset_completed, mfa_enrolled, mfa_disabled, email_verified, identity_linked, identity_unlinked |
| **Membership** | member_invited, member_joined, member_removed, role_changed, ownership_transferred |
| **Company** | company_created, company_suspended, company_reactivated, deletion_requested, deletion_approved, deletion_completed, plan_changed |
| **Security** | cross_tenant_denied, session_revoked, api_key_created, api_key_revoked, break_glass_used |
| **Data** | data_exported, data_imported, backup_created, backup_restored, permanent_delete |
| **Billing** | subscription_started, subscription_canceled, payment_failed, trial_extended |

### Platform administration

- Time-limited, MFA-protected break-glass access for platform admins
- No permanent platform-admin tenant browsing permission
- All platform admin actions audited in the security stream
- Require written justification for tenant data access

### GDPR / data protection

| Requirement | Implementation |
|-------------|---------------|
| Data export | `data_export_jobs` table → async job → presigned download URL with expiry |
| Data erasure | `company_deletion_requests` → state machine (requested → exported → legal_hold → approved → purging → completed) |
| Audit retention | Configurable per company (default: 2 years) |
| PII inventory | Documented: users.email, users.name, owners.phone, owners.email, password_credentials |
| Consent tracking | Track terms/privacy policy acceptance timestamp |

### Backup deletion limitations

Company hard deletion cannot instantly remove records from immutable backups. Document:
- Backup retention period (30 days)
- Whether encryption keys support crypto-erasure (if KMS keys are destroyed, encrypted backups become unreadable)
- A deletion tombstone preventing restored data from becoming active
- A post-restore purge procedure
- What customers are told about backup expiration

---

## 13. File Storage & Encryption

### Storage architecture

```
private/company/{companyPublicId}/attachments/{attachmentUuid}/original
```

Use attachment UUIDs (ULID), never predictable animal IDs in storage keys.

### Explicit link tables (no polymorphic relationships)

Instead of `entity_type` + `entity_id` (which can't be protected by a DB foreign key), use explicit link tables:

```sql
animal_attachments (company_id, attachment_id, animal_id)
  -- composite FK: (company_id, animal_id) → animals, (company_id, attachment_id) → file_attachments
company_logo_attachments (company_id, attachment_id)
expense_attachments (company_id, attachment_id, expense_id)
```

Each link table uses composite FKs to enforce tenant integrity. An application bug cannot attach Company A's file to an entity in Company B.

### Upload pipeline (quarantine-based)

1. Create pending `file_attachments` record (status='pending')
2. Authorize owning entity (verify `company_id` via link table) and quota
3. Generate short-lived presigned PUT URL → upload to **quarantine** prefix
4. Upload completes → verify size, magic bytes, checksum (SHA-256), actual decoder validity
5. Re-encode images to strip metadata and malicious payloads
6. Scan (ClamAV or cloud scan)
7. Move to clean storage or mark as `rejected`
8. Update `file_attachments.status = 'clean'`
9. Create link table entry (e.g., `animal_attachments`)
10. Permit download only for `status='clean'` objects
11. Delete abandoned pending/multipart uploads (cron job)

### Download flow

1. Resolve link table entry (e.g., `animal_attachments` with composite FK)
2. Verify `file_attachments.company_id === ctx.companyId`
3. Verify `file_attachments.status === 'clean'`
4. Generate presigned GET URL (1h expiry)
5. Return URL to client

### S3 hardening

- S3 Block Public Access at account AND bucket level
- Disable ACLs (bucket-owner-enforced ownership)
- Presigned URLs inherit signing principal permissions — signing role must only access required bucket/prefix/operations
- SSE-KMS encryption with per-tenant key (or shared key with envelope encryption)

### Upload validation

| Check | Value |
|-------|-------|
| Max file size | 5 MB (photos), 10 MB (documents) |
| Allowed types | image/jpeg, image/png, image/webp |
| Magic bytes | Verify actual file type, not just Content-Type header |
| EXIF/metadata | Stripped during re-encoding |
| Virus scan | ClamAV or cloud scan (async, quarantine if positive) |
| Filename | Server-generated (ULID), ignore client filename |

### Encryption

| Layer | Method |
|-------|--------|
| **In transit** | TLS 1.2+ everywhere; HSTS header; no HTTP fallback |
| **DB at rest** | MySQL TDE or disk-level encryption (LUKS/EBS) |
| **S3 at rest** | SSE-KMS (KMS-managed keys) |
| **Secrets** | Secrets manager (AWS Secrets Manager / HashiCorp Vault), not plaintext env |
| **Cookie signing** | Not needed (opaque token + server-side hash + pepper) |
| **MFA secrets** | Envelope-encrypted with key versioning |
| **Password hashes** | argon2id (never plaintext, never reversible) |
| **Backup codes** | argon2id hashes |
| **Auth tokens** | SHA-256 hashes in `authentication_tokens` |
| **Outbox token payloads** | Envelope-encrypted, erased after sending |

---

## 14. Subscriptions, Billing & Usage Limits

### Separated status fields

```
companies.lifecycle_status
  active
  suspended_by_admin
  deletion_requested
  purging

company_subscriptions.provider_status
  trialing
  active
  past_due
  unpaid
  canceled
  incomplete
  paused
  unknown
```

Application access is derived through a **centralized entitlement service** that checks both statuses. Never hard-delete a tenant solely because a Stripe webhook says canceled.

### Company deletion state machine

```
requested → exported → legal_hold (retention period) → approved → purging → completed
                                                              ↓
                                                           cancelled
```

- `requested`: user or admin requests deletion
- `exported`: data export completed and downloaded
- `legal_hold`: mandatory retention period (configurable, default 30 days)
- `approved`: legal hold expires or admin approves
- `purging`: background job hard-deleting all company data
- `completed`: all data purged, company record marked deleted
- **Backup limitation**: purged data may still exist in immutable backups; document retention period and crypto-erasure options

### Plans

| Plan | Farms | Animals | Users | Price/mo |
|------|-------|---------|-------|----------|
| Free | 1 | 50 | 3 | $0 |
| Starter | 3 | 500 | 10 | $49 |
| Professional | 10 | 5,000 | 50 | $199 |
| Enterprise | NULL | NULL | NULL | Custom |

`NULL = unlimited` for limit fields. Do not mix `-1`, `0`, and nullable. `plan_version` snapshots terms at subscription time — do not retroactively change existing subscribers.

### Atomic quota enforcement (in resource transaction)

```typescript
async function createAnimal(ctx: TenantContext, command: CreateAnimalCommand) {
  return db.transaction(async (tx) => {
    // 1. Entitlement check
    await entitlementService.assertMutationAllowed(ctx, tx);

    // 2. Quota check + increment IN SAME TRANSACTION as animal creation
    await quotaService.assertAndIncrement(ctx.companyId, "animals", 1, tx);

    // 3. Generate animal ID (lock sequence row)
    const animalId = await generateNextAnimalId(ctx, command.categoryId, tx);

    // 4. Insert animal
    const animal = await insertAnimal(ctx, command, animalId, tx);

    // 5. Audit
    await insertAuditEvent(ctx, "animal.created", animal.id, tx);

    return animal;
  });
}
// If animal creation fails, the transaction rolls back — quota counter is NOT incremented.
```

Also define atomic behavior for:
- Delete/archive (decrement counter)
- Restore (increment counter)
- Bulk import (batch increment + per-item rollback)
- Invitation acceptance (increment user count)
- User disable/reactivation (decrement/increment)
- Moving resources between companies: **prohibited** (different tenants)

Add a **reconciliation job** that recalculates usage from source tables and alerts on differences.

`company_usage_current` is the authoritative source. `usage_daily` is analytics history only.

### Billing webhook processing (resilient)

```
billing_webhook_events
  provider_event_id UNIQUE
  event_type
  payload
  processing_status
  locked_by + locked_until (worker leasing)
```

Webhook handler:
1. Verify Stripe signature
2. Store event transactionally (INSERT, ignore if duplicate `provider_event_id`)
3. Return 200 quickly
4. Process asynchronously via worker (claim with locked_by + locked_until)
5. Ignore already-processed event IDs
6. Handle events out of order (retrieve current subscription state when needed)
7. Use Stripe idempotency keys for outbound creates/updates

### Suspension flow (via entitlement service)

| `lifecycle_status` | `provider_status` | Behavior |
|---------------------|-------------------|----------|
| `active` | `trialing` | Full access until `trial_ends_at` |
| `active` | `active` | Full access |
| `active` | `past_due` | Read-only until `grace_ends_at` (7 days), then suspended |
| `suspended_by_admin` | any | Read-only (can view/export, no mutations) |
| `deletion_requested` | any | Read-only, export available, deletion in progress |
| `purging` | any | No access |

### Usage metering

Daily snapshot job → `usage_daily` table. API call counter in Redis (keyed by `company_id`). Alert at 80% and 95% of any limit. Dashboard widget: usage vs limits. Reconciliation job compares `company_usage_current` with source table counts.

---

## 15. Scalability, Backups & Disaster Recovery

### Scalability

- Composite indexes `(company_id, ...)` on all tenant tables
- Connection pooling (mysql2 or ProxySQL for read/write splitting)
- Redis: permission cache (key: `perm:{companyId}:{permissionsVersion}:{role}`), session validation, rate limits (key: `rate:{companyId}:{userId}`), dashboard KPIs (key: `kpi:{companyId}:{hash}`, TTL 60s)
- Per-tenant rate limiting: token bucket per `(companyId, userId)` — configurable by plan
- Query timeout: 30s default, 60s reports — prevents noisy neighbor degradation

### Backups

| Type | Frequency | Retention |
|------|-----------|-----------|
| Full DB | Daily | 30 days |
| Binlog | Continuous | 7 days |
| Per-tenant export | On-demand (via `data_export_jobs`) | Configurable |
| S3 files | Daily versioning + cross-region replication | 30 days |
| Config/secrets | On change, versioned in secrets manager | Indefinite |

**Backup deletion limitation**: Company hard deletion cannot instantly remove records from immutable backups. Document retention period, crypto-erasure options (KMS key destruction), deletion tombstones, and post-restore purge procedure.

### Disaster recovery

| Metric | Target |
|--------|--------|
| RPO | < 1 hour |
| RTO | < 4 hours |
| Failover | Automated (managed DB: RDS/Aurora) |
| Backup verification | Monthly restore to staging, run test suite |

### Monitoring

| Metric | Alert Threshold |
|--------|----------------|
| Per-tenant error rate | > 5% in 5 min |
| Per-tenant slow queries | > 5s avg in 10 min |
| Cross-tenant access denied | Any occurrence (security incident) |
| Quota breach | > 95% of any limit |
| Failed login spike | > 20 per IP in 5 min |
| DB connection pool | > 80% |
| Disk space | > 85% |
| Usage reconciliation mismatch | Any difference (alert + investigate) |

---

## 16. Migration Strategy

### Principles

- **Never** use `companyId = 1` as a default parameter — it hides missed migrations and silently writes to Tenant 1
- Make `TenantContext` mandatory at compile time
- Deploy dual-write code before backfilling so new rows always have tenant columns
- Rehearse rollback and restore before production
- Use online DDL or online schema migration tool for large tables — ordinary `ALTER TABLE` may lock production tables

### Phase 1: Schema preparation (zero downtime)

1. Create all new tables (companies, farms, company_users, sessions, user_identities, password_credentials, authentication_tokens, mfa_credentials, mfa_recovery_codes, outbox_events, idempotency_keys, billing_webhook_events, file_attachments, animal_attachments, data_export_jobs, company_deletion_requests, company_security_policies, company_usage_current, subscription_plans, company_subscriptions, usage_daily)
2. Add nullable `companyId` column to all tenant tables (no NOT NULL yet)
3. Add nullable `farmId` column to farm-scoped tables
4. Add `public_id BINARY(16)` to all tenant tables (nullable initially)
5. Add composite unique keys (e.g., `uq_farms_company_id_id`) alongside existing constraints
6. Add `audit_log.company_id` as nullable (not NOT NULL — follows same migration pattern)
7. **Do NOT** drop existing global unique constraints yet

### Phase 2: Dual-write deployment

1. Create default company (id=1, slug="azal-farms") + default farm (id=1)
2. Deploy **dual-write code** that writes `companyId`, `farmId`, and `public_id` for all new rows
3. Legacy application continues working but new rows now have tenant columns populated

### Phase 3: Backfill

1. Backfill historical rows in bounded batches (1000 rows at a time):
   - `UPDATE animals SET companyId = 1, farmId = 1 WHERE companyId IS NULL`
   - Same for all other tenant tables
2. Generate ULIDs for `public_id` on all existing rows
3. Run a **catch-up backfill** for rows inserted between batch 1 and completion
4. Verify zero null rows and zero orphan relationships

### Phase 4: Constraint enforcement

1. Add composite foreign keys
2. Make `companyId` NOT NULL (remove nullable)
3. Drop old global unique constraints
4. Add generated-column unique constraints for soft-delete safety
5. Add `owner_company_guard` generated column on `company_users`
6. Add all foreign keys to new architecture tables

### Phase 5: Code migration

1. Deploy dual-read code that reads `companyId` from rows and passes it through
2. Update `createContext` to load memberships, create `TenantContext`
3. Add `TenantContext` parameter to every `db.ts` function — **mandatory, no default**
4. Migrate routers to `companyProcedure` one by one
5. Enable ESLint/AST rule banning direct table access outside repository modules
6. Run cross-tenant integration test suite
7. Run mutation tests (remove companyId predicate → CI fails)

### Phase 6: Auth migration

1. Add email/password auth alongside existing OAuth
2. Create `user_identities` rows for existing OAuth users (provider='manus')
3. Create `company_users` rows for existing users (role = current `users.role`, companyId = 1)
4. Create `sessions` table, migrate to opaque server-side sessions
5. Existing users get session with `user_auth_version = 1`

### Phase 7: Production cutover

1. Verify all counts match (animal count, expense count, etc.)
2. Enable new-tenant registration
3. Remove legacy read compatibility code
4. Drop old global unique indexes
5. Rehearse rollback and restore

### Compile-time enforcement

```typescript
// TenantContext is required — no bare companyId accepted
type TenantContext = Readonly<{
  companyId: CompanyId;
  membershipId: CompanyMembershipId;
  userId: UserId;
  accessibleFarmIds: readonly FarmId[] | "all";
  farmAccessMode: "all" | "restricted";
}>;

getAnimals(ctx: TenantContext, filters: AnimalFilters)  // ✓
getAnimals(companyId: number, filters: AnimalFilters)   // ✗ banned by type
getAnimals(filters: AnimalFilters)                       // ✗ banned by type
```

### CI controls (beyond text scan)

- Custom ESLint/AST rule: ban `.from(table)` / `.insert(table)` / `.update(table)` / `.delete(table)` outside `server/repository/` modules
- Raw SQL allowlist: `sql\`...\`` templates must be in an allowlist file
- Cross-tenant integration tests: 100% of endpoints
- Mutation tests: remove `companyId` predicate → CI fails
- Tests for: caches, exports, queues, scheduled jobs, imports, files, reports

---

## 17. Threat Model & Security Checklist

### Threat model

| Threat | Mitigation |
|--------|------------|
| Cross-tenant data access | db.ts WHERE company_id + composite FKs + CI gate + test matrix |
| Cross-tenant relationship corruption | Composite foreign keys at DB level |
| Tenant ID spoofing | companyId from route, never request body |
| Stale tab wrong-company write | Route-based context; no company_id in session for auth; no session rotation on navigation |
| Privilege escalation | Role changes require admin+; can't change own role; auth_version bump |
| Session hijacking | Opaque token + HttpOnly + Secure + SameSite=Lax + server-side revocation + pepper |
| CSRF | SameSite=Lax + signed CSRF token + custom header + Origin validation + no GET mutations |
| XSS-driven CSRF | CSRF token bound to session; custom header required |
| Brute force | Progressive delays + combined IP/account/device limits + argon2id |
| Information leak | 404 for cross-tenant, 403 for within-tenant; no global lookups |
| Mass assignment | Explicit command types (never `Partial<Animal>`); companyId never in input |
| SQL injection | Drizzle parameterized queries + raw SQL allowlist |
| File access bypass | Explicit link tables + composite FKs; presigned URLs; quarantine pipeline |
| Token replay | Single-use, short expiry, hashed at rest, TOTP step tracking |
| Noisy neighbor | Per-tenant timeout + rate limit |
| Insider (platform admin) | All access audited; time-limited MFA break-glass; no permanent browsing |
| Fail-open farm access | Explicit `farm_access_mode` enum; restricted users get assigned farms only |
| Quota race condition | Atomic locked `company_usage_current` row in same transaction as resource creation |
| Sequence race | `FOR UPDATE` lock on sequence row in same transaction as insert |
| Webhook duplication | `billing_webhook_events` with unique `provider_event_id`; idempotent processing |
| Soft-delete uniqueness gap | Generated columns with `CASE WHEN deleted_at IS NULL` for active-only uniques |
| Farm data leakage | Restricted users without farmId get assigned farms only, NOT all company farms |
| Outbox token leak | Encrypted payload for tokens; erased after sending |
| Idempotency key collision | Per-tenant uniqueness, not global; body hash conflict detection |
| Audit chain race | Per-company chain with locked chain-head row |
| Backup data persistence | Document retention, crypto-erasure, tombstones, post-restore purge |
| Multiple owners | `owner_company_guard` generated column UNIQUE at DB level |
| Email verification drift | Single source: `user_identities.provider_email_verified` via `primary_email_identity_id` |

### CSRF protection (complete, not just SameSite)

| Control | Implementation |
|---------|---------------|
| SameSite | Lax (useful but not sufficient) |
| CSRF token | Signed, session-bound, double-submit pattern |
| Custom header | Required on all mutations (e.g., `X-LFMS-CSRF: {token}`) |
| Origin validation | Check `Origin` header; controlled `Referer` fallback |
| CORS | Exact credentialed allowlist (no wildcards) |
| No GET mutations | All mutations via POST/PUT/PATCH/DELETE only |
| Protected endpoints | CSRF on: company switch, logout, email changes, MFA, invitations, billing |

### Security checklist (must pass before production)

- [ ] `companyId` from route, never request body or session
- [ ] No `company_id` in sessions for authorization (only UX preference)
- [ ] Every db.ts method takes `TenantContext` (compile-time enforced)
- [ ] Every query includes `company_id` in WHERE (CI-enforced via AST rule)
- [ ] Every query on farm-scoped tables applies farm scope (restricted users get assigned farms only)
- [ ] Every update/delete uses `public_id` + tenant predicates (never by internal id alone)
- [ ] Every update/delete verifies company + farm scope before mutating
- [ ] Explicit command types (never `Partial<Entity>`)
- [ ] Composite foreign keys on all tenant relationships (DB-enforced)
- [ ] Cross-tenant access returns 404; within-tenant denied returns 403
- [ ] No global lookups that could reveal another tenant's resource existence
- [ ] Opaque server-side sessions with revocation + pepper
- [ ] `users.auth_version` for session invalidation (not session-stored security_version)
- [ ] `company_users.authorization_version` for role change propagation
- [ ] `SameSite=Lax` + signed CSRF token + custom header + Origin validation
- [ ] Passwords: argon2id, min 15 chars, compromised-password check, no composition rules
- [ ] All tokens stored as hashes in `authentication_tokens`
- [ ] Authentication tokens bound to `user_identity_id` for verify_email/identity_link
- [ ] MFA: per-user enrollment, per-company enforcement, step-up auth
- [ ] MFA secrets envelope-encrypted with key versioning
- [ ] TOTP replay prevention via atomic `last_used_totp_step` update
- [ ] MFA v1: TOTP only (no WebAuthn until separate table exists)
- [ ] Progressive lockout (not simple 24h lock)
- [ ] Session revocation on password change (auth_version bump)
- [ ] Session reads from primary DB (not lagging replica)
- [ ] Throttled `last_seen_at` updates (once per 5 min)
- [ ] Bootstrap endpoints for partial sessions (verify-email, MFA enroll, logout)
- [ ] Audit log: append-only (insert-only DB credentials), per-company hash chain, company-scoped
- [ ] File uploads: quarantine pipeline, magic bytes, re-encode, scan, clean-only download
- [ ] File attachments: explicit link tables with composite FKs (no polymorphic)
- [ ] `file_attachments` has composite unique key `(company_id, id)` for link table FKs
- [ ] S3: Block Public Access, ACLs disabled, SSE-KMS
- [ ] HTTPS enforced + HSTS
- [ ] Secrets in secrets manager
- [ ] DB encryption at rest
- [ ] Per-tenant rate limiting on API
- [ ] Atomic quota enforcement (locked usage row in same transaction as resource creation)
- [ ] Quota reconciliation job
- [ ] Sequence generation retry-safe (FOR UPDATE + retry on conflict)
- [ ] Outbox pattern for all email/notification/billing actions
- [ ] Outbox: encrypted payload for tokens, erased after sending, worker leasing (locked_by/locked_until)
- [ ] Outbox: `deduplication_key` has actual UNIQUE constraint `(company_id, event_type, deduplication_key)`
- [ ] Webhook inbox with idempotent processing + worker leasing
- [ ] Identity separation (user_identities + password_credentials, no auto-linking by email)
- [ ] Registration with existing email enters secure account-link/recovery flow (no auto-link, no duplicate user)
- [ ] Email verification: single source of truth (`user_identities.provider_email_verified` via `primary_email_identity_id`)
- [ ] `primary_email_identity_id` uses composite FK ensuring identity belongs to same user
- [ ] Explicit farm access mode (never inferred from absence)
- [ ] Immutable farm snapshots on historical records (weight, vaccination, lambing, sales, status history)
- [ ] Historical records have both `(company_id, animal_id)` and `(company_id, farm_id)` composite FKs
- [ ] Generated columns for soft-delete-safe uniques (all soft-deletable tables)
- [ ] `owner_company_guard` generated column (at most one active owner per company)
- [ ] `current_company_guard` generated column (at most one current subscription per company)
- [ ] Opaque public IDs (ULID) for all external references
- [ ] Company deletion state machine (no auto-hard-delete from webhook)
- [ ] Backup deletion limitations documented (retention, crypto-erasure, tombstones)
- [ ] Idempotency keys: per-tenant uniqueness, body hash conflict detection, FKs to companies/users
- [ ] Billing: `trial_ends_at`, `grace_ends_at`, `plan_snapshot`, `is_current`, `currency`, `stripe_price_id`
- [ ] Role permissions: `effect ENUM('allow','deny')`, UNIQUE without `effect` column
- [ ] Permission cache versioned: `perm:{companyId}:{permissionsVersion}:{role}`
- [ ] Permission evaluation: layered deny-first (not "first match wins")
- [ ] Company-wide visibility = regardless of farm assignment, NOT regardless of RBAC
- [ ] Role hierarchy rules enforced (admin can't manage owners, can't change own role)
- [ ] All new tables have foreign keys with explicit ON DELETE behavior
- [ ] Actor columns reference memberships via composite FKs (not global users)
- [ ] `users.role` deprecated — replaced by `platform_admins` table
- [ ] PlatformContext for system jobs and platform admin (separate from TenantContext)
- [ ] Platform repositories narrowly scoped (no generic cross-tenant query)
- [ ] WebSocket authorization at subscription/channel level (not only on connect)
- [ ] WebSocket membership revalidation on room join; revoke on membership change
- [ ] `sessions.last_selected_company_id` FK to companies ON DELETE SET NULL
- [ ] `outbox_events.company_id` FK to companies
- [ ] Migration: `role_permissions.company_id` and `audit_log.action_category` added nullable first
- [ ] Cross-tenant test matrix passes (100% of endpoints)
- [ ] Mutation tests pass (remove companyId → CI fails)
- [ ] Security review passed
- [ ] Pen test scheduled pre-launch

---

## 18. Tenant Propagation Across Async Systems

Every cache key, queued message, background job, and async process must carry a validated tenant identifier.

| System | Tenant Propagation |
|--------|-------------------|
| **Redis cache keys** | Prefix all keys with `company_id`: `perm:{cid}:{role}`, `rate:{cid}:{uid}`, `kpi:{cid}:{hash}` |
| **Background workers** | Outbox events include `company_id`; worker loads authoritative DB row and derives company context — does not trust `company_id` from message alone |
| **Scheduled jobs** | Job payload includes `event_id`/`job_id`; worker loads DB row to derive company context; iterate per-company |
| **WebSockets** | Connection authenticated → `company_id` bound to connection; **authorize at subscription/channel level, not only on connect**; revalidate membership when joining a company room; disconnect or revoke subscriptions after membership changes |
| **Search indexes** | Index includes `company_id` field; queries always filter by it |
| **File metadata** | `file_attachments.company_id` checked on every access via link table |
| **Email notifications** | Outbox event includes `company_id`; email template renders company-scoped data |
| **Analytics** | All events tagged with `company_id` |
| **CSV/Excel exports** | Export job scoped to `company_id`; data filtered; presigned URL company-bound |
| **Imports** | Import scoped to `company_id`; all inserted rows get `company_id` from ctx |
| **Error logs/tracing** | Structured logs include `company_id` tag for per-tenant error rate monitoring |

### Queue worker security

Queue payload should contain `job_id` / `event_id` only. The worker loads the authoritative database row and derives its company context. Do not trust an arbitrary queue message containing only `company_id` and entity IDs.

### Missing architecture components (complete list)

```
companies
farms
company_users
company_user_farms
company_invitations
company_security_policies
company_usage_current
company_subscriptions
subscription_plans
usage_daily
sessions
user_identities
password_credentials
authentication_tokens
mfa_credentials
mfa_recovery_codes
outbox_events
idempotency_keys
billing_webhook_events
file_attachments
animal_attachments
company_logo_attachments
expense_attachments
data_export_jobs
company_deletion_requests
platform_admins
```
