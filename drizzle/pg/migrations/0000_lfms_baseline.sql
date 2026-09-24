CREATE TYPE "public"."capital_contributions_kind" AS ENUM('initial', 'direct', 'pro_rata', 'reversal');;
--> statement-breakpoint
CREATE TYPE "public"."capital_funding_batches_kind" AS ENUM('pro_rata', 'reversal');;
--> statement-breakpoint
CREATE TYPE "public"."capital_profit_allocations_kind" AS ENUM('monthly', 'adjustment');;
--> statement-breakpoint
CREATE TYPE "public"."capital_profit_allocations_status" AS ENUM('draft', 'finalized');;
--> statement-breakpoint
CREATE TYPE "public"."saas_authentication_tokens_purpose" AS ENUM('verify_email', 'reset_password', 'change_email', 'identity_link');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_animals_acquisitiontype" AS ENUM('purchased', 'born');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_animals_purchasefundingsource" AS ENUM('revenue', 'investment');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_animals_sex" AS ENUM('male', 'female');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_audit_log_actioncategory" AS ENUM('auth', 'crud', 'config', 'membership', 'billing', 'security', 'data_export', 'data_delete', 'company');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_audit_log_actortype" AS ENUM('tenant_user', 'platform_admin', 'support', 'system_job', 'migration');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_audit_log_outcome" AS ENUM('success', 'denied', 'error');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_expenses_scopetype" AS ENUM('company', 'farm');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_expenses_targettype" AS ENUM('general', 'category', 'head', 'herd');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_feed_stock_ledger_transactiontype" AS ENUM('purchase', 'stock_count', 'adjustment');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_lambing_log_sex" AS ENUM('male', 'female');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_notifications_priority" AS ENUM('low', 'medium', 'high', 'critical');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_pregnancy_records_status" AS ENUM('active', 'delivered', 'aborted', 'lost');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_role_permissions_role" AS ENUM('owner', 'supervisor', 'staff', 'admin', 'user', 'viewer');;
--> statement-breakpoint
CREATE TYPE "public"."saas_azal_vaccines_validityunit" AS ENUM('days', 'months');;
--> statement-breakpoint
CREATE TYPE "public"."saas_background_jobs_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'dead_letter', 'canceled');;
--> statement-breakpoint
CREATE TYPE "public"."saas_companies_lifecyclestatus" AS ENUM('provisioning', 'active', 'suspended', 'deletion_requested', 'purging', 'deleted');;
--> statement-breakpoint
CREATE TYPE "public"."saas_company_feature_overrides_accessmode" AS ENUM('enabled', 'read_only', 'disabled');;
--> statement-breakpoint
CREATE TYPE "public"."saas_company_invitations_farmaccessmode" AS ENUM('all', 'restricted');;
--> statement-breakpoint
CREATE TYPE "public"."saas_company_invitations_role" AS ENUM('owner', 'supervisor', 'staff', 'admin', 'user', 'viewer');;
--> statement-breakpoint
CREATE TYPE "public"."saas_company_invitations_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');;
--> statement-breakpoint
CREATE TYPE "public"."saas_company_memberships_farmaccessmode" AS ENUM('all', 'restricted');;
--> statement-breakpoint
CREATE TYPE "public"."saas_company_memberships_role" AS ENUM('owner', 'supervisor', 'staff', 'admin', 'user', 'viewer');;
--> statement-breakpoint
CREATE TYPE "public"."saas_company_memberships_status" AS ENUM('invited', 'active', 'suspended', 'removed');;
--> statement-breakpoint
CREATE TYPE "public"."saas_company_role_permissions_effect" AS ENUM('allow', 'deny');;
--> statement-breakpoint
CREATE TYPE "public"."saas_company_role_permissions_role" AS ENUM('owner', 'supervisor', 'staff', 'admin', 'user', 'viewer');;
--> statement-breakpoint
CREATE TYPE "public"."saas_company_subscriptions_status" AS ENUM('trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired');;
--> statement-breakpoint
CREATE TYPE "public"."saas_deletion_requests_status" AS ENUM('requested', 'exported', 'legal_hold', 'approved', 'purging', 'completed', 'canceled');;
--> statement-breakpoint
CREATE TYPE "public"."saas_email_log_status" AS ENUM('sent', 'failed', 'skipped_unconfigured');;
--> statement-breakpoint
CREATE TYPE "public"."saas_export_jobs_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'expired', 'canceled');;
--> statement-breakpoint
CREATE TYPE "public"."saas_farms_status" AS ENUM('active', 'suspended', 'archived');;
--> statement-breakpoint
CREATE TYPE "public"."saas_feature_catalog_disableddatamode" AS ENUM('read_only', 'hidden', 'inaccessible');;
--> statement-breakpoint
CREATE TYPE "public"."saas_feature_catalog_limitunit" AS ENUM('boolean', 'count', 'bytes', 'requests');;
--> statement-breakpoint
CREATE TYPE "public"."saas_feature_catalog_status" AS ENUM('active', 'deprecated');;
--> statement-breakpoint
CREATE TYPE "public"."saas_idempotency_keys_status" AS ENUM('processing', 'completed', 'failed');;
--> statement-breakpoint
CREATE TYPE "public"."saas_mfa_credentials_method" AS ENUM('totp');;
--> statement-breakpoint
CREATE TYPE "public"."saas_oauth_states_audience" AS ENUM('tenant', 'platform');;
--> statement-breakpoint
CREATE TYPE "public"."saas_outbox_events_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'dead_letter');;
--> statement-breakpoint
CREATE TYPE "public"."saas_plan_entitlements_accessmode" AS ENUM('enabled', 'read_only', 'disabled');;
--> statement-breakpoint
CREATE TYPE "public"."saas_platform_administrators_status" AS ENUM('invited', 'active', 'suspended', 'revoked');;
--> statement-breakpoint
CREATE TYPE "public"."saas_platform_sessions_authlevel" AS ENUM('primary', 'mfa', 'step_up');;
--> statement-breakpoint
CREATE TYPE "public"."saas_security_events_actortype" AS ENUM('anonymous', 'tenant_user', 'platform_admin', 'support', 'system_job');;
--> statement-breakpoint
CREATE TYPE "public"."saas_security_events_outcome" AS ENUM('success', 'denied', 'error');;
--> statement-breakpoint
CREATE TYPE "public"."saas_security_events_severity" AS ENUM('info', 'warning', 'high', 'critical');;
--> statement-breakpoint
CREATE TYPE "public"."saas_subscription_plans_status" AS ENUM('draft', 'active', 'retired');;
--> statement-breakpoint
CREATE TYPE "public"."saas_support_access_approvals_decision" AS ENUM('approved', 'rejected');;
--> statement-breakpoint
CREATE TYPE "public"."saas_support_access_grants_accessmode" AS ENUM('read_only', 'write');;
--> statement-breakpoint
CREATE TYPE "public"."saas_support_access_grants_status" AS ENUM('pending', 'approved', 'active', 'expired', 'revoked', 'rejected');;
--> statement-breakpoint
CREATE TYPE "public"."saas_tenant_files_status" AS ENUM('reserved', 'uploading', 'quarantine', 'clean', 'rejected', 'deleted');;
--> statement-breakpoint
CREATE TYPE "public"."saas_tenant_restore_jobs_status" AS ENUM('pending', 'validating', 'ready', 'restoring', 'completed', 'failed', 'rolled_back', 'canceled');;
--> statement-breakpoint
CREATE TYPE "public"."saas_tenant_sessions_authlevel" AS ENUM('primary', 'mfa', 'step_up');;
--> statement-breakpoint
CREATE TYPE "public"."saas_usage_counters_periodtype" AS ENUM('lifetime', 'daily', 'monthly', 'billing_period');;
--> statement-breakpoint
CREATE TYPE "public"."saas_users_role" AS ENUM('owner', 'supervisor', 'staff', 'admin', 'user', 'viewer');;
--> statement-breakpoint
CREATE TYPE "public"."saas_users_status" AS ENUM('active', 'locked', 'disabled');;
--> statement-breakpoint
CREATE TABLE "saas_azal_animal_categories" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_animal_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"speciesId" integer NOT NULL,
	"idPrefix" varchar(10) NOT NULL,
	"idSequence" integer DEFAULT 0 NOT NULL,
	"lambIdSequence" integer DEFAULT 0 NOT NULL,
	"targetWeightKg" numeric(8, 2),
	"expectedCycleDays" integer,
	"autoStageWeightKg" numeric(8, 2),
	"autoStageTargetCategoryId" integer,
	"readyToSellThreshold" numeric(5, 2) DEFAULT '80.00' NOT NULL,
	"isExitStatus" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeName" varchar(100) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN LOWER("name") ELSE NULL END) STORED,
	"activePrefix" varchar(10) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN UPPER("idPrefix") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_animal_categories_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_animal_status_history" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_animal_status_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer NOT NULL,
	"animalId" integer,
	"legacyAnimalId" integer,
	"animalPublicIdSnapshot" varchar(26),
	"animalCodeSnapshot" varchar(20),
	"previousStatusId" integer,
	"newStatusId" integer NOT NULL,
	"changedAt" timestamp (0) DEFAULT now() NOT NULL,
	"changedBy" integer,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_animal_status_history_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_animal_statuses" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_animal_statuses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"isExitStatus" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeName" varchar(100) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN LOWER("name") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_animal_statuses_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_animals" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_animals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer NOT NULL,
	"animalId" varchar(20) NOT NULL,
	"speciesId" integer NOT NULL,
	"categoryId" integer NOT NULL,
	"groupId" integer NOT NULL,
	"statusId" integer NOT NULL,
	"sex" "saas_azal_animals_sex" NOT NULL,
	"acquisitionType" "saas_azal_animals_acquisitiontype" NOT NULL,
	"acquisitionDate" date NOT NULL,
	"birthDate" date NOT NULL,
	"damId" integer,
	"sireId" integer,
	"ownerId" integer,
	"photoUrl" varchar(500),
	"purchaseCost" numeric(10, 2) DEFAULT '0',
	"purchaseFundingSource" "saas_azal_animals_purchasefundingsource",
	"weightAtAcquisition" numeric(8, 2),
	"exitDate" date,
	"exitReason" text,
	"notes" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeAnimalCode" varchar(20) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN UPPER("animalId") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_animals_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_audit_log" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer,
	"farmId" integer,
	"userId" integer,
	"membershipId" integer,
	"platformAdministratorId" integer,
	"supportAccessGrantId" integer,
	"actorType" "saas_azal_audit_log_actortype",
	"action" varchar(50) NOT NULL,
	"actionCategory" "saas_azal_audit_log_actioncategory",
	"entityType" varchar(50) NOT NULL,
	"entityId" varchar(50),
	"oldValues" json,
	"newValues" json,
	"ipAddress" varchar(45),
	"userAgent" varchar(500),
	"requestId" varchar(64),
	"outcome" "saas_azal_audit_log_outcome" DEFAULT 'success' NOT NULL,
	"metadata" json,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"revertedAt" timestamp (0),
	"revertedByUserId" integer,
	"revertOfAuditId" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_audit_log_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_auth_identities" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_auth_identities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"providerSubject" varchar(255),
	"providerEmail" varchar(320),
	"providerEmailVerified" boolean DEFAULT false NOT NULL,
	"linkedAt" timestamp (0),
	"lastUsedAt" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_auth_rate_limits" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_auth_rate_limits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"keyHash" varchar(64) NOT NULL,
	"bucketStart" timestamp (0) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp (0) NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_authentication_tokens" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_authentication_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"authIdentityId" integer,
	"purpose" "saas_authentication_tokens_purpose" NOT NULL,
	"tokenHash" "bytea" NOT NULL,
	"targetValue" varchar(320),
	"attempts" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp (0) NOT NULL,
	"usedAt" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_authentication_tokens_tokenHash_unique" UNIQUE("tokenHash")
);;
--> statement-breakpoint
CREATE TABLE "saas_background_jobs" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_background_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer,
	"jobType" varchar(120) NOT NULL,
	"payload" json NOT NULL,
	"status" "saas_background_jobs_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"maxAttempts" integer DEFAULT 5 NOT NULL,
	"runAt" timestamp (0) DEFAULT now() NOT NULL,
	"lockedBy" varchar(100),
	"lockedUntil" timestamp (0),
	"deduplicationKey" varchar(200),
	"deduplicationCompanyId" integer GENERATED ALWAYS AS (COALESCE("companyId", 0)) STORED,
	"lastError" text,
	"requestId" varchar(64),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"startedAt" timestamp (0),
	"completedAt" timestamp (0),
	CONSTRAINT "saas_background_jobs_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_birth_types" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_birth_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeName" varchar(50) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN LOWER("name") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_birth_types_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "capital_contributions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "capital_contributions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ownerId" integer NOT NULL,
	"investorId" integer NOT NULL,
	"batchId" integer,
	"kind" "capital_contributions_kind" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"effectiveDate" date NOT NULL,
	"notes" text,
	"reversalOfContributionId" integer,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "capital_funding_batches" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "capital_funding_batches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ownerId" integer NOT NULL,
	"kind" "capital_funding_batches_kind" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"effectiveDate" date NOT NULL,
	"notes" text,
	"reversalOfBatchId" integer,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "capital_investors" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "capital_investors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ownerId" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(30),
	"email" varchar(100),
	"notes" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer
);;
--> statement-breakpoint
CREATE TABLE "capital_profit_allocation_lines" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "capital_profit_allocation_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"allocationId" integer NOT NULL,
	"investorId" integer NOT NULL,
	"ownershipPct" numeric(9, 6) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "capital_profit_allocations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "capital_profit_allocations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ownerId" integer NOT NULL,
	"kind" "capital_profit_allocations_kind" NOT NULL,
	"status" "capital_profit_allocations_status" DEFAULT 'draft' NOT NULL,
	"periodStart" date NOT NULL,
	"periodEnd" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"adjustmentOfAllocationId" integer,
	"notes" text,
	"finalizedAt" timestamp (0),
	"finalizedBy" integer,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_companies" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_companies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"lifecycleStatus" "saas_companies_lifecyclestatus" DEFAULT 'provisioning' NOT NULL,
	"settings" json,
	"entitlementVersion" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"suspendedAt" timestamp (0),
	"suspendedReason" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"deletedAt" timestamp (0),
	CONSTRAINT "saas_companies_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "saas_companies_slug_unique" UNIQUE("slug")
);;
--> statement-breakpoint
CREATE TABLE "saas_company_branding" (
	"companyId" integer PRIMARY KEY NOT NULL,
	"logoTenantFileId" integer,
	"faviconTenantFileId" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedByMembershipId" integer,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_company_category_sequences" (
	"companyId" integer NOT NULL,
	"categoryId" integer NOT NULL,
	"animalIdSequence" integer DEFAULT 0 NOT NULL,
	"lambIdSequence" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "company_category_sequences_pk" PRIMARY KEY("companyId","categoryId")
);;
--> statement-breakpoint
CREATE TABLE "saas_company_feature_overrides" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_company_feature_overrides_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"featureId" integer NOT NULL,
	"accessMode" "saas_company_feature_overrides_accessmode",
	"limitValue" bigint,
	"configuration" json,
	"reason" text NOT NULL,
	"startsAt" timestamp (0) DEFAULT now() NOT NULL,
	"expiresAt" timestamp (0),
	"isCurrent" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"createdByPlatformAdministratorId" integer NOT NULL,
	"revokedByPlatformAdministratorId" integer,
	"revokedAt" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"currentCompanyFeatureGuard" varchar(80) GENERATED ALWAYS AS (CASE WHEN "isCurrent" = TRUE THEN "companyId"::text || ':' || "featureId"::text ELSE NULL END) STORED,
	CONSTRAINT "saas_company_feature_overrides_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_company_invitations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_company_invitations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"normalizedEmail" varchar(320) NOT NULL,
	"role" "saas_company_invitations_role" DEFAULT 'viewer' NOT NULL,
	"farmAccessMode" "saas_company_invitations_farmaccessmode" DEFAULT 'restricted' NOT NULL,
	"farmPublicIds" json,
	"provider" varchar(50) DEFAULT 'manus' NOT NULL,
	"providerSubjectHash" "bytea" NOT NULL,
	"tokenHash" "bytea" NOT NULL,
	"status" "saas_company_invitations_status" DEFAULT 'pending' NOT NULL,
	"invitedByMembershipId" integer,
	"invitedByPlatformAdministratorId" integer,
	"acceptedByUserId" integer,
	"expiresAt" timestamp (0) NOT NULL,
	"acceptedAt" timestamp (0),
	"revokedAt" timestamp (0),
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"activeEmail" varchar(320) GENERATED ALWAYS AS (CASE WHEN "status" = 'pending' THEN "normalizedEmail" ELSE NULL END) STORED,
	CONSTRAINT "saas_company_invitations_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "saas_company_invitations_tokenHash_unique" UNIQUE("tokenHash")
);;
--> statement-breakpoint
CREATE TABLE "saas_company_memberships" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_company_memberships_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "saas_company_memberships_role" DEFAULT 'viewer' NOT NULL,
	"status" "saas_company_memberships_status" DEFAULT 'invited' NOT NULL,
	"farmAccessMode" "saas_company_memberships_farmaccessmode" DEFAULT 'restricted' NOT NULL,
	"authorizationVersion" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"invitedByMembershipId" integer,
	"joinedAt" timestamp (0),
	"removedAt" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"ownerCompanyGuard" integer GENERATED ALWAYS AS (CASE WHEN "role" = 'owner' AND "status" = 'active' THEN "companyId" ELSE NULL END) STORED,
	"notificationPreferences" json,
	CONSTRAINT "saas_company_memberships_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_company_role_permissions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_company_role_permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"companyId" integer NOT NULL,
	"role" "saas_company_role_permissions_role" NOT NULL,
	"resource" varchar(100) NOT NULL,
	"action" varchar(100) NOT NULL,
	"effect" "saas_company_role_permissions_effect" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedByMembershipId" integer,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_company_security_policies" (
	"companyId" integer PRIMARY KEY NOT NULL,
	"requireMfa" boolean DEFAULT false NOT NULL,
	"allowedMfaMethods" json,
	"privilegedSessionMaxAgeSeconds" integer DEFAULT 900 NOT NULL,
	"requireMfaForOwners" boolean DEFAULT true NOT NULL,
	"requireMfaForBilling" boolean DEFAULT true NOT NULL,
	"requireMfaForDataExport" boolean DEFAULT false NOT NULL,
	"updatedByMembershipId" integer,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_company_subscriptions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_company_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"subscriptionPlanId" integer NOT NULL,
	"planSnapshot" json NOT NULL,
	"status" "saas_company_subscriptions_status" DEFAULT 'trialing' NOT NULL,
	"periodStart" timestamp (0) NOT NULL,
	"periodEnd" timestamp (0) NOT NULL,
	"trialEndsAt" timestamp (0),
	"graceEndsAt" timestamp (0),
	"canceledAt" timestamp (0),
	"isCurrent" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"changedByPlatformAdministratorId" integer,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"currentCompanyGuard" integer GENERATED ALWAYS AS (CASE WHEN "isCurrent" = TRUE THEN "companyId" ELSE NULL END) STORED,
	CONSTRAINT "saas_company_subscriptions_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_deletion_requests" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_deletion_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"requestedByMembershipId" integer,
	"requestedByPlatformAdministratorId" integer,
	"approvedByPlatformAdministratorId" integer,
	"reason" text NOT NULL,
	"status" "saas_deletion_requests_status" DEFAULT 'requested' NOT NULL,
	"retentionUntil" timestamp (0) NOT NULL,
	"approvedAt" timestamp (0),
	"purgedAt" timestamp (0),
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_deletion_requests_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_email_log" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_email_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"template" varchar(100) NOT NULL,
	"recipientEmail" varchar(254) NOT NULL,
	"companyId" integer,
	"status" "saas_email_log_status" NOT NULL,
	"errorMessage" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_expense_categories" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_expense_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeName" varchar(100) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN LOWER("name") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_expense_categories_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_expense_sub_categories" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_expense_sub_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"categoryId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeName" varchar(100) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN LOWER("name") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_expense_sub_categories_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_expenses" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_expenses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer,
	"scopeType" "saas_azal_expenses_scopetype" DEFAULT 'company' NOT NULL,
	"expenseDate" date NOT NULL,
	"categoryId" integer NOT NULL,
	"subCategoryId" integer,
	"amount" numeric(10, 2) NOT NULL,
	"targetType" "saas_azal_expenses_targettype" NOT NULL,
	"categoryTarget" integer,
	"headId" integer,
	"vendorName" varchar(100),
	"notes" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_expenses_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_export_jobs" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_export_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer,
	"requestedByMembershipId" integer,
	"requestedByPlatformAdministratorId" integer,
	"supportAccessGrantId" integer,
	"exportType" varchar(80) NOT NULL,
	"filters" json,
	"status" "saas_export_jobs_status" DEFAULT 'pending' NOT NULL,
	"tenantFileId" integer,
	"failureReason" text,
	"expiresAt" timestamp (0) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"completedAt" timestamp (0),
	CONSTRAINT "saas_export_jobs_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_farm_memberships" (
	"companyId" integer NOT NULL,
	"companyMembershipId" integer NOT NULL,
	"farmId" integer NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "farm_memberships_pk" PRIMARY KEY("companyMembershipId","farmId")
);;
--> statement-breakpoint
CREATE TABLE "saas_farms" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_farms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"code" varchar(40) NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"status" "saas_farms_status" DEFAULT 'active' NOT NULL,
	"settings" json,
	"version" integer DEFAULT 1 NOT NULL,
	"createdByMembershipId" integer,
	"deletedByMembershipId" integer,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"deletedAt" timestamp (0),
	"activeCode" varchar(40) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN LOWER("code") ELSE NULL END) STORED,
	CONSTRAINT "saas_farms_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_feature_catalog" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_feature_catalog_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"status" "saas_feature_catalog_status" DEFAULT 'active' NOT NULL,
	"disabledDataMode" "saas_feature_catalog_disableddatamode" DEFAULT 'read_only' NOT NULL,
	"limitUnit" "saas_feature_catalog_limitunit" DEFAULT 'boolean' NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_feature_catalog_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "saas_feature_catalog_code_unique" UNIQUE("code")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_feed_item_price_history" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_feed_item_price_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer,
	"feedItemId" integer NOT NULL,
	"effectiveDate" date NOT NULL,
	"pricePerUnit" numeric(10, 2) NOT NULL,
	"notes" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_feed_item_price_history_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_feed_items" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_feed_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"unit" varchar(20) DEFAULT 'kg' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeName" varchar(100) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN LOWER("name") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_feed_items_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_feed_stock_ledger" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_feed_stock_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer NOT NULL,
	"feedItemId" integer NOT NULL,
	"transactionDate" date NOT NULL,
	"transactionType" "saas_azal_feed_stock_ledger_transactiontype" NOT NULL,
	"qty" numeric(10, 3) NOT NULL,
	"unitCost" numeric(10, 2),
	"totalCost" numeric(10, 2),
	"supplierName" varchar(100),
	"notes" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_feed_stock_ledger_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_groups" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer NOT NULL,
	"groupCode" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"speciesId" integer,
	"categoryId" integer,
	"description" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"mapShape" json,
	"color" varchar(20),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeCode" varchar(20) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN UPPER("groupCode") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_groups_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_idempotency_keys" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_idempotency_keys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"companyId" integer,
	"scopeCompanyId" integer GENERATED ALWAYS AS (COALESCE("companyId", 0)) STORED,
	"userId" integer NOT NULL,
	"keyHash" varchar(128) NOT NULL,
	"requestMethod" varchar(10) NOT NULL,
	"requestPathHash" varchar(128) NOT NULL,
	"requestBodyHash" varchar(128) NOT NULL,
	"responseStatus" integer,
	"responseBody" json,
	"status" "saas_idempotency_keys_status" DEFAULT 'processing' NOT NULL,
	"lockedUntil" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"expiresAt" timestamp (0) NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_lambing_log" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_lambing_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer NOT NULL,
	"lambId" varchar(20) NOT NULL,
	"speciesId" integer,
	"categoryId" integer,
	"birthDate" date NOT NULL,
	"damId" integer,
	"sireId" integer,
	"sex" "saas_azal_lambing_log_sex" NOT NULL,
	"birthTypeId" integer NOT NULL,
	"birthWeightKg" numeric(8, 2),
	"valueUsed" numeric(10, 2),
	"groupId" integer,
	"notes" text,
	"isPromoted" boolean DEFAULT false NOT NULL,
	"promotedHeadId" integer,
	"promotedAnimalCode" varchar(20),
	"promotedAnimalPurgedAt" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeLambCode" varchar(20) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN UPPER("lambId") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_lambing_log_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_legacy_user_links" (
	"companyId" integer NOT NULL,
	"legacyUserId" integer NOT NULL,
	"saasUserId" integer NOT NULL,
	"legacyOpenId" varchar(64) NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_legacy_user_links_pk" PRIMARY KEY("companyId","legacyUserId")
);;
--> statement-breakpoint
CREATE TABLE "saas_mfa_credentials" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_mfa_credentials_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"method" "saas_mfa_credentials_method" NOT NULL,
	"encryptedSecret" text NOT NULL,
	"encryptionKeyVersion" varchar(50) NOT NULL,
	"lastUsedTotpStep" bigint,
	"enabledAt" timestamp (0),
	"disabledAt" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_mfa_recovery_codes" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_mfa_recovery_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"mfaCredentialId" bigint NOT NULL,
	"codeHash" varchar(255) NOT NULL,
	"usedAt" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_notification_receipts" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_notification_receipts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"companyId" integer NOT NULL,
	"notificationId" integer NOT NULL,
	"companyMembershipId" integer NOT NULL,
	"deliveredAt" timestamp (0),
	"readAt" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_notifications" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer,
	"userId" integer,
	"alertType" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"relatedEntityType" varchar(50),
	"relatedEntityId" varchar(50),
	"isRead" boolean DEFAULT false NOT NULL,
	"priority" "saas_azal_notifications_priority" DEFAULT 'medium' NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"expiresAt" timestamp (0),
	"deduplicationKey" varchar(200),
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_notifications_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_oauth_states" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_oauth_states_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"stateHash" varchar(64) NOT NULL,
	"audience" "saas_oauth_states_audience" NOT NULL,
	"redirectUri" varchar(500) NOT NULL,
	"returnTo" varchar(500) NOT NULL,
	"browserBindingHash" varchar(64) NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"expiresAt" timestamp (0) NOT NULL,
	"consumedAt" timestamp (0),
	CONSTRAINT "saas_oauth_states_stateHash_unique" UNIQUE("stateHash")
);;
--> statement-breakpoint
CREATE TABLE "saas_outbox_events" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_outbox_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"companyId" integer,
	"eventType" varchar(120) NOT NULL,
	"payload" json,
	"encryptedPayload" text,
	"encryptionKeyVersion" varchar(50),
	"status" "saas_outbox_events_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"maxAttempts" integer DEFAULT 5 NOT NULL,
	"nextAttemptAt" timestamp (0) DEFAULT now() NOT NULL,
	"lockedBy" varchar(100),
	"lockedUntil" timestamp (0),
	"deduplicationKey" varchar(200),
	"deduplicationCompanyId" integer GENERATED ALWAYS AS (COALESCE("companyId", 0)) STORED,
	"lastError" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"processedAt" timestamp (0),
	CONSTRAINT "outbox_payload_check" CHECK ("payload" IS NOT NULL OR "encryptedPayload" IS NOT NULL)
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_owners" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_owners_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"phone" varchar(30),
	"email" varchar(100),
	"notes" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_owners_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_password_credentials" (
	"userId" integer PRIMARY KEY NOT NULL,
	"passwordHash" varchar(255) NOT NULL,
	"passwordChangedAt" timestamp (0) DEFAULT now() NOT NULL,
	"passwordNeedsRehash" boolean DEFAULT false NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_plan_entitlements" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_plan_entitlements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subscriptionPlanId" integer NOT NULL,
	"featureId" integer NOT NULL,
	"accessMode" "saas_plan_entitlements_accessmode" DEFAULT 'disabled' NOT NULL,
	"limitValue" bigint,
	"configuration" json,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_platform_administrator_roles" (
	"platformAdministratorId" integer NOT NULL,
	"platformRoleId" integer NOT NULL,
	"grantedByPlatformAdministratorId" integer,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "platform_administrator_roles_pk" PRIMARY KEY("platformAdministratorId","platformRoleId")
);;
--> statement-breakpoint
CREATE TABLE "saas_platform_administrators" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_platform_administrators_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"userId" integer NOT NULL,
	"status" "saas_platform_administrators_status" DEFAULT 'invited' NOT NULL,
	"authVersion" integer DEFAULT 1 NOT NULL,
	"mfaRequired" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"grantedByPlatformAdministratorId" integer,
	"grantedAt" timestamp (0) DEFAULT now() NOT NULL,
	"revokedAt" timestamp (0),
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_platform_administrators_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "saas_platform_administrators_userId_unique" UNIQUE("userId")
);;
--> statement-breakpoint
CREATE TABLE "saas_platform_identities" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_platform_identities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"platformAdministratorId" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"providerSubject" varchar(255) NOT NULL,
	"providerEmail" varchar(320),
	"providerEmailVerified" boolean DEFAULT false NOT NULL,
	"lastUsedAt" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_platform_permissions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_platform_permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" varchar(120) NOT NULL,
	"description" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_platform_permissions_code_unique" UNIQUE("code")
);;
--> statement-breakpoint
CREATE TABLE "saas_platform_role_permissions" (
	"platformRoleId" integer NOT NULL,
	"platformPermissionId" integer NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "platform_role_permissions_pk" PRIMARY KEY("platformRoleId","platformPermissionId")
);;
--> statement-breakpoint
CREATE TABLE "saas_platform_roles" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_platform_roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" varchar(100) NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"isSystem" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_platform_roles_code_unique" UNIQUE("code")
);;
--> statement-breakpoint
CREATE TABLE "saas_platform_sessions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_platform_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"tokenHash" varchar(128) NOT NULL,
	"tokenFamilyId" varchar(64) NOT NULL,
	"platformAdministratorId" integer NOT NULL,
	"authLevel" "saas_platform_sessions_authlevel" DEFAULT 'primary' NOT NULL,
	"mfaVerifiedAt" timestamp (0),
	"authenticationMethods" json,
	"authVersion" integer NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp (0) DEFAULT now() NOT NULL,
	"idleExpiresAt" timestamp (0) NOT NULL,
	"expiresAt" timestamp (0) NOT NULL,
	"revokedAt" timestamp (0),
	"revokedReason" varchar(200),
	"ipAddress" varchar(45),
	"userAgent" varchar(500),
	CONSTRAINT "saas_platform_sessions_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "saas_platform_sessions_tokenHash_unique" UNIQUE("tokenHash")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_pregnancy_records" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_pregnancy_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer NOT NULL,
	"animalId" integer NOT NULL,
	"sireId" integer,
	"confirmationDate" date NOT NULL,
	"gestationDays" integer NOT NULL,
	"expectedDueDate" date NOT NULL,
	"notifyBeforeDue" integer DEFAULT 7 NOT NULL,
	"checkupDate" date,
	"notifyBeforeCheckup" integer DEFAULT 3 NOT NULL,
	"status" "saas_azal_pregnancy_records_status" DEFAULT 'active' NOT NULL,
	"outcomeLambingLogId" integer,
	"completedDate" date,
	"notes" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeAnimalGuard" integer GENERATED ALWAYS AS (CASE WHEN "status" = 'active' AND "deletedAt" IS NULL THEN "animalId" ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_pregnancy_records_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_ration_plans" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_ration_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer,
	"categoryId" integer NOT NULL,
	"feedItemId" integer NOT NULL,
	"qtyPerHeadPerDay" numeric(8, 3) NOT NULL,
	"effectiveDate" date NOT NULL,
	"endDate" date,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_ration_plans_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_role_permissions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_role_permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"role" "saas_azal_role_permissions_role" NOT NULL,
	"page" varchar(64) NOT NULL,
	"action" varchar(64) NOT NULL,
	"allowed" boolean NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedBy" integer
);;
--> statement-breakpoint
CREATE TABLE "saas_schema_migrations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_schema_migrations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"version" varchar(100) NOT NULL,
	"checksumSha256" varchar(64) NOT NULL,
	"executionId" varchar(26) NOT NULL,
	"appliedBy" varchar(200) NOT NULL,
	"appliedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_schema_migrations_version_unique" UNIQUE("version")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_sales" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_sales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer NOT NULL,
	"animalId" integer NOT NULL,
	"saleDate" date NOT NULL,
	"salePrice" numeric(10, 2) NOT NULL,
	"amountPaid" numeric(10, 2) DEFAULT '0' NOT NULL,
	"weightAtSale" numeric(8, 2),
	"pricePerKg" numeric(10, 2),
	"buyerName" varchar(100),
	"notes" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_sales_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_security_events" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_security_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer,
	"actorType" "saas_security_events_actortype" NOT NULL,
	"userId" integer,
	"platformAdministratorId" integer,
	"supportAccessGrantId" integer,
	"eventType" varchar(120) NOT NULL,
	"severity" "saas_security_events_severity" DEFAULT 'info' NOT NULL,
	"outcome" "saas_security_events_outcome" NOT NULL,
	"requestId" varchar(64),
	"ipAddress" varchar(45),
	"userAgent" varchar(500),
	"metadata" json,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_security_events_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_species" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_species_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"gestationDays" integer DEFAULT 150 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeName" varchar(100) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN LOWER("name") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_species_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_subscription_plans" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_subscription_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"planVersion" integer DEFAULT 1 NOT NULL,
	"status" "saas_subscription_plans_status" DEFAULT 'draft' NOT NULL,
	"priceMonthly" numeric(12, 2) DEFAULT '0' NOT NULL,
	"priceYearly" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"createdByPlatformAdministratorId" integer,
	"publishedAt" timestamp (0),
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_subscription_plans_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_support_access_approvals" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_support_access_approvals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"supportAccessGrantId" integer NOT NULL,
	"platformAdministratorId" integer NOT NULL,
	"decision" "saas_support_access_approvals_decision" NOT NULL,
	"notes" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_support_access_grants" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_support_access_grants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"requestedByPlatformAdministratorId" integer NOT NULL,
	"accessMode" "saas_support_access_grants_accessmode" DEFAULT 'read_only' NOT NULL,
	"allowedScopes" json NOT NULL,
	"reason" text NOT NULL,
	"ticketReference" varchar(150) NOT NULL,
	"status" "saas_support_access_grants_status" DEFAULT 'pending' NOT NULL,
	"activatedAt" timestamp (0),
	"expiresAt" timestamp (0) NOT NULL,
	"revokedAt" timestamp (0),
	"revokedByPlatformAdministratorId" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"activeCompanyTicketGuard" varchar(200) GENERATED ALWAYS AS (CASE WHEN "status" IN ('pending','approved','active') THEN "companyId"::text || ':' || LOWER("ticketReference")::text ELSE NULL END) STORED,
	CONSTRAINT "saas_support_access_grants_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_system_settings" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_system_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"settingKey" varchar(100) NOT NULL,
	"settingValue" text NOT NULL,
	"description" text,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_system_settings_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_tenant_files" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_tenant_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer,
	"storageKey" varchar(500) NOT NULL,
	"originalName" varchar(255) NOT NULL,
	"contentType" varchar(100) NOT NULL,
	"sizeBytes" bigint NOT NULL,
	"checksumSha256" varchar(64) NOT NULL,
	"status" "saas_tenant_files_status" DEFAULT 'reserved' NOT NULL,
	"uploadedByMembershipId" integer,
	"generatedByBackgroundJobId" bigint,
	"generatedByExportJobId" bigint,
	"scanResult" json,
	"verifiedAt" timestamp (0),
	"deletedAt" timestamp (0),
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_tenant_files_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "saas_tenant_files_storageKey_unique" UNIQUE("storageKey"),
	CONSTRAINT "tenant_files_attribution_check" CHECK ((("uploadedByMembershipId" IS NOT NULL)::int + ("generatedByBackgroundJobId" IS NOT NULL)::int) = 1 AND ("generatedByExportJobId" IS NULL OR "generatedByBackgroundJobId" IS NOT NULL))
);;
--> statement-breakpoint
CREATE TABLE "saas_tenant_restore_jobs" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_tenant_restore_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"sourceTenantFileId" integer NOT NULL,
	"preRestoreExportJobId" bigint,
	"requestedByPlatformAdministratorId" integer NOT NULL,
	"approvedByPlatformAdministratorId" integer,
	"status" "saas_tenant_restore_jobs_status" DEFAULT 'pending' NOT NULL,
	"validationResult" json,
	"failureReason" text,
	"maintenanceLeaseUntil" timestamp (0),
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"completedAt" timestamp (0),
	CONSTRAINT "saas_tenant_restore_jobs_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_tenant_sessions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_tenant_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"tokenHash" varchar(128) NOT NULL,
	"tokenFamilyId" varchar(64) NOT NULL,
	"userId" integer NOT NULL,
	"lastSelectedCompanyId" integer,
	"authLevel" "saas_tenant_sessions_authlevel" DEFAULT 'primary' NOT NULL,
	"mfaVerifiedAt" timestamp (0),
	"authenticationMethods" json,
	"userAuthVersion" integer NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp (0) DEFAULT now() NOT NULL,
	"idleExpiresAt" timestamp (0) NOT NULL,
	"expiresAt" timestamp (0) NOT NULL,
	"idleTimeoutMs" integer,
	"revokedAt" timestamp (0),
	"revokedReason" varchar(200),
	"ipAddress" varchar(45),
	"userAgent" varchar(500),
	CONSTRAINT "saas_tenant_sessions_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "saas_tenant_sessions_tokenHash_unique" UNIQUE("tokenHash")
);;
--> statement-breakpoint
CREATE TABLE "saas_usage_counters" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_usage_counters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"companyId" integer NOT NULL,
	"featureId" integer,
	"metricCode" varchar(100) NOT NULL,
	"periodType" "saas_usage_counters_periodtype" NOT NULL,
	"periodStart" timestamp (0) NOT NULL,
	"periodEnd" timestamp (0) NOT NULL,
	"usedValue" bigint DEFAULT 0 NOT NULL,
	"reservedValue" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_user_settings" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_user_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"userId" integer NOT NULL,
	"companyId" integer NOT NULL,
	"settingKey" varchar(100) NOT NULL,
	"settingValue" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_azal_user_settings_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_users" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"normalizedEmail" varchar(320),
	"loginMethod" varchar(64),
	"role" "saas_users_role" DEFAULT 'user' NOT NULL,
	"status" "saas_users_status" DEFAULT 'active' NOT NULL,
	"authVersion" integer DEFAULT 1 NOT NULL,
	"failedLoginAttempts" integer DEFAULT 0 NOT NULL,
	"lockedUntil" timestamp (0),
	"lastPasswordChange" timestamp (0),
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp (0) DEFAULT now() NOT NULL,
	CONSTRAINT "saas_users_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "saas_users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "saas_users_normalizedEmail_unique" UNIQUE("normalizedEmail")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_vaccination_records" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_vaccination_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer NOT NULL,
	"animalId" integer NOT NULL,
	"vaccineId" integer NOT NULL,
	"vaccinationDate" date NOT NULL,
	"nextDueDate" date,
	"boosterDueDate" date,
	"notifyBeforeNext" integer DEFAULT 7,
	"notifyBeforeBooster" integer DEFAULT 7,
	"batchNumber" varchar(50),
	"notes" text,
	"veterinarian" varchar(100),
	"isCompleted" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_vaccination_records_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_vaccines" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_vaccines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"validityPeriod" integer NOT NULL,
	"validityUnit" "saas_azal_vaccines_validityunit" DEFAULT 'days' NOT NULL,
	"boosterRequired" boolean DEFAULT false NOT NULL,
	"boosterInterval" integer,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"activeName" varchar(100) GENERATED ALWAYS AS (CASE WHEN "deletedAt" IS NULL THEN LOWER("name") ELSE NULL END) STORED,
	CONSTRAINT "saas_azal_vaccines_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE TABLE "saas_azal_weight_log" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "saas_azal_weight_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"publicId" varchar(26) NOT NULL,
	"companyId" integer NOT NULL,
	"farmId" integer NOT NULL,
	"animalId" integer NOT NULL,
	"weighDate" date NOT NULL,
	"weightKg" numeric(8, 2) NOT NULL,
	"sessionId" varchar(36),
	"notes" text,
	"createdAt" timestamp (0) DEFAULT now() NOT NULL,
	"createdBy" integer,
	"deletedAt" timestamp (0),
	"deletedBy" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saas_azal_weight_log_publicId_unique" UNIQUE("publicId")
);;
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_categories_company_id_id_unique" ON "saas_azal_animal_categories" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_categories_company_active_name_unique" ON "saas_azal_animal_categories" USING btree ("companyId","activeName");;
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_categories_company_active_prefix_unique" ON "saas_azal_animal_categories" USING btree ("companyId","activePrefix");;
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_statuses_company_id_id_unique" ON "saas_azal_animal_statuses" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "animal_statuses_company_active_name_unique" ON "saas_azal_animal_statuses" USING btree ("companyId","activeName");;
--> statement-breakpoint
CREATE UNIQUE INDEX "animals_company_id_id_unique" ON "saas_azal_animals" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "animals_farm_active_code_unique" ON "saas_azal_animals" USING btree ("companyId","farmId","activeAnimalCode");;
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_unique" ON "saas_auth_identities" USING btree ("provider","providerSubject");;
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_user_provider_unique" ON "saas_auth_identities" USING btree ("userId","provider");;
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_user_id_id_unique" ON "saas_auth_identities" USING btree ("userId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_rate_limits_bucket_unique" ON "saas_auth_rate_limits" USING btree ("keyHash","bucketStart");;
--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_deduplication_unique" ON "saas_background_jobs" USING btree ("deduplicationCompanyId","jobType","deduplicationKey");;
--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_company_id_id_unique" ON "saas_background_jobs" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "birth_types_company_id_id_unique" ON "saas_azal_birth_types" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "birth_types_company_active_name_unique" ON "saas_azal_birth_types" USING btree ("companyId","activeName");;
--> statement-breakpoint
CREATE UNIQUE INDEX "capital_contributions_reversal_unique" ON "capital_contributions" USING btree ("reversalOfContributionId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "capital_funding_batches_reversal_unique" ON "capital_funding_batches" USING btree ("reversalOfBatchId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "capital_profit_lines_allocation_investor_unique" ON "capital_profit_allocation_lines" USING btree ("allocationId","investorId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "capital_profit_allocations_owner_kind_period_unique" ON "capital_profit_allocations" USING btree ("ownerId","kind","periodStart","periodEnd");;
--> statement-breakpoint
CREATE UNIQUE INDEX "company_feature_overrides_current_unique" ON "saas_company_feature_overrides" USING btree ("currentCompanyFeatureGuard");;
--> statement-breakpoint
CREATE UNIQUE INDEX "company_invitations_active_email_unique" ON "saas_company_invitations" USING btree ("companyId","activeEmail");;
--> statement-breakpoint
CREATE UNIQUE INDEX "company_memberships_company_id_id_unique" ON "saas_company_memberships" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "company_memberships_company_user_unique" ON "saas_company_memberships" USING btree ("companyId","userId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "company_memberships_owner_guard_unique" ON "saas_company_memberships" USING btree ("ownerCompanyGuard");;
--> statement-breakpoint
CREATE UNIQUE INDEX "company_role_permissions_scope_unique" ON "saas_company_role_permissions" USING btree ("companyId","role","resource","action");;
--> statement-breakpoint
CREATE UNIQUE INDEX "company_subscriptions_current_company_unique" ON "saas_company_subscriptions" USING btree ("currentCompanyGuard");;
--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_company_id_id_unique" ON "saas_azal_expense_categories" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_company_active_name_unique" ON "saas_azal_expense_categories" USING btree ("companyId","activeName");;
--> statement-breakpoint
CREATE UNIQUE INDEX "expense_sub_categories_company_id_id_unique" ON "saas_azal_expense_sub_categories" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "expense_sub_categories_parent_active_name_unique" ON "saas_azal_expense_sub_categories" USING btree ("companyId","categoryId","activeName");;
--> statement-breakpoint
CREATE UNIQUE INDEX "export_jobs_company_id_id_unique" ON "saas_export_jobs" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "farms_company_id_id_unique" ON "saas_farms" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "farms_company_active_code_unique" ON "saas_farms" USING btree ("companyId","activeCode");;
--> statement-breakpoint
CREATE UNIQUE INDEX "feed_items_company_id_id_unique" ON "saas_azal_feed_items" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "feed_items_company_active_name_unique" ON "saas_azal_feed_items" USING btree ("companyId","activeName");;
--> statement-breakpoint
CREATE UNIQUE INDEX "groups_company_id_id_unique" ON "saas_azal_groups" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "groups_farm_active_code_unique" ON "saas_azal_groups" USING btree ("companyId","farmId","activeCode");;
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_scope_unique" ON "saas_idempotency_keys" USING btree ("scopeCompanyId","userId","requestMethod","requestPathHash","keyHash");;
--> statement-breakpoint
CREATE UNIQUE INDEX "lambing_log_company_id_id_unique" ON "saas_azal_lambing_log" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "lambing_log_promoted_head_unique" ON "saas_azal_lambing_log" USING btree ("promotedHeadId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "lambing_log_farm_active_code_unique" ON "saas_azal_lambing_log" USING btree ("companyId","farmId","activeLambCode");;
--> statement-breakpoint
CREATE UNIQUE INDEX "saas_legacy_user_links_company_user_unique" ON "saas_legacy_user_links" USING btree ("companyId","saasUserId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_credentials_user_method_unique" ON "saas_mfa_credentials" USING btree ("userId","method");;
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_receipts_recipient_unique" ON "saas_azal_notification_receipts" USING btree ("notificationId","companyMembershipId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_company_id_id_unique" ON "saas_azal_notifications" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_tenant_deduplication_unique" ON "saas_azal_notifications" USING btree ("companyId","alertType","deduplicationKey");;
--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_deduplication_unique" ON "saas_outbox_events" USING btree ("deduplicationCompanyId","eventType","deduplicationKey");;
--> statement-breakpoint
CREATE UNIQUE INDEX "owners_company_id_id_unique" ON "saas_azal_owners" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "plan_entitlements_plan_feature_unique" ON "saas_plan_entitlements" USING btree ("subscriptionPlanId","featureId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_identities_provider_subject_unique" ON "saas_platform_identities" USING btree ("provider","providerSubject");;
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_identities_admin_provider_unique" ON "saas_platform_identities" USING btree ("platformAdministratorId","provider");;
--> statement-breakpoint
CREATE UNIQUE INDEX "pregnancy_records_tenant_active_animal_unique" ON "saas_azal_pregnancy_records" USING btree ("companyId","activeAnimalGuard");;
--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_page_action_unique" ON "saas_azal_role_permissions" USING btree ("role","page","action");;
--> statement-breakpoint
CREATE UNIQUE INDEX "sales_tenant_animal_unique" ON "saas_azal_sales" USING btree ("companyId","animalId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "species_company_id_id_unique" ON "saas_azal_species" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "species_company_active_name_unique" ON "saas_azal_species" USING btree ("companyId","activeName");;
--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_code_version_unique" ON "saas_subscription_plans" USING btree ("code","planVersion");;
--> statement-breakpoint
CREATE UNIQUE INDEX "support_access_approvals_approver_unique" ON "saas_support_access_approvals" USING btree ("supportAccessGrantId","platformAdministratorId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "support_access_grants_company_id_id_unique" ON "saas_support_access_grants" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "support_access_grants_active_ticket_unique" ON "saas_support_access_grants" USING btree ("activeCompanyTicketGuard");;
--> statement-breakpoint
CREATE UNIQUE INDEX "system_settings_company_key_unique" ON "saas_azal_system_settings" USING btree ("companyId","settingKey");;
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_files_company_id_id_unique" ON "saas_tenant_files" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_files_generated_job_unique" ON "saas_tenant_files" USING btree ("generatedByBackgroundJobId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_files_generated_export_unique" ON "saas_tenant_files" USING btree ("generatedByExportJobId");;
--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_metric_period_unique" ON "saas_usage_counters" USING btree ("companyId","metricCode","periodType","periodStart","periodEnd");;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_company_user_key_unique" ON "saas_azal_user_settings" USING btree ("companyId","userId","settingKey");;
--> statement-breakpoint
CREATE UNIQUE INDEX "vaccines_company_id_id_unique" ON "saas_azal_vaccines" USING btree ("companyId","id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "vaccines_company_active_name_unique" ON "saas_azal_vaccines" USING btree ("companyId","activeName");;
--> statement-breakpoint
CREATE UNIQUE INDEX "weight_log_tenant_session_animal_unique" ON "saas_azal_weight_log" USING btree ("companyId","sessionId","animalId");;
--> statement-breakpoint
CREATE INDEX "animal_status_history_tenant_animal_time_idx" ON "saas_azal_animal_status_history" USING btree ("companyId","animalId","changedAt","id");;
--> statement-breakpoint
CREATE INDEX "animals_farm_status_idx" ON "saas_azal_animals" USING btree ("companyId","farmId","statusId","deletedAt");;
--> statement-breakpoint
CREATE INDEX "animals_company_owner_idx" ON "saas_azal_animals" USING btree ("companyId","ownerId","deletedAt");;
--> statement-breakpoint
CREATE INDEX "audit_log_company_time_idx" ON "saas_azal_audit_log" USING btree ("companyId","createdAt","id");;
--> statement-breakpoint
CREATE INDEX "audit_log_actor_time_idx" ON "saas_azal_audit_log" USING btree ("actorType","platformAdministratorId","userId","createdAt");;
--> statement-breakpoint
CREATE INDEX "audit_log_request_idx" ON "saas_azal_audit_log" USING btree ("requestId");;
--> statement-breakpoint
CREATE INDEX "audit_log_entity_v2_idx" ON "saas_azal_audit_log" USING btree ("companyId","entityType","entityId","createdAt");;
--> statement-breakpoint
CREATE INDEX "auth_rate_limits_expiry_idx" ON "saas_auth_rate_limits" USING btree ("expiresAt");;
--> statement-breakpoint
CREATE INDEX "authentication_tokens_lookup_idx" ON "saas_authentication_tokens" USING btree ("userId","purpose","expiresAt");;
--> statement-breakpoint
CREATE INDEX "background_jobs_claim_idx" ON "saas_background_jobs" USING btree ("status","runAt","priority","lockedUntil","id");;
--> statement-breakpoint
CREATE INDEX "background_jobs_company_history_idx" ON "saas_background_jobs" USING btree ("companyId","createdAt","id");;
--> statement-breakpoint
CREATE INDEX "capital_contributions_owner_date_idx" ON "capital_contributions" USING btree ("ownerId","effectiveDate");;
--> statement-breakpoint
CREATE INDEX "capital_contributions_investor_date_idx" ON "capital_contributions" USING btree ("investorId","effectiveDate");;
--> statement-breakpoint
CREATE INDEX "capital_funding_batches_owner_date_idx" ON "capital_funding_batches" USING btree ("ownerId","effectiveDate");;
--> statement-breakpoint
CREATE INDEX "capital_investors_owner_active_idx" ON "capital_investors" USING btree ("ownerId","isActive");;
--> statement-breakpoint
CREATE INDEX "capital_profit_allocations_owner_period_idx" ON "capital_profit_allocations" USING btree ("ownerId","periodStart","periodEnd");;
--> statement-breakpoint
CREATE INDEX "companies_lifecycle_idx" ON "saas_companies" USING btree ("lifecycleStatus","id");;
--> statement-breakpoint
CREATE INDEX "company_branding_logo_file_idx" ON "saas_company_branding" USING btree ("logoTenantFileId");;
--> statement-breakpoint
CREATE INDEX "company_branding_favicon_file_idx" ON "saas_company_branding" USING btree ("faviconTenantFileId");;
--> statement-breakpoint
CREATE INDEX "company_feature_overrides_company_expiry_idx" ON "saas_company_feature_overrides" USING btree ("companyId","isCurrent","expiresAt");;
--> statement-breakpoint
CREATE INDEX "company_invitations_company_status_idx" ON "saas_company_invitations" USING btree ("companyId","status","expiresAt");;
--> statement-breakpoint
CREATE INDEX "company_memberships_user_status_idx" ON "saas_company_memberships" USING btree ("userId","status","companyId");;
--> statement-breakpoint
CREATE INDEX "company_subscriptions_history_idx" ON "saas_company_subscriptions" USING btree ("companyId","createdAt","id");;
--> statement-breakpoint
CREATE INDEX "company_subscriptions_expiry_idx" ON "saas_company_subscriptions" USING btree ("status","periodEnd","id");;
--> statement-breakpoint
CREATE INDEX "company_subscriptions_trial_expiry_idx" ON "saas_company_subscriptions" USING btree ("status","trialEndsAt","id");;
--> statement-breakpoint
CREATE INDEX "company_subscriptions_grace_expiry_idx" ON "saas_company_subscriptions" USING btree ("status","graceEndsAt","id");;
--> statement-breakpoint
CREATE INDEX "deletion_requests_company_status_idx" ON "saas_deletion_requests" USING btree ("companyId","status","createdAt");;
--> statement-breakpoint
CREATE INDEX "email_log_template_time_idx" ON "saas_email_log" USING btree ("template","createdAt","id");;
--> statement-breakpoint
CREATE INDEX "email_log_recipient_time_idx" ON "saas_email_log" USING btree ("recipientEmail","createdAt","id");;
--> statement-breakpoint
CREATE INDEX "expenses_scope_date_idx" ON "saas_azal_expenses" USING btree ("companyId","scopeType","farmId","expenseDate","id");;
--> statement-breakpoint
CREATE INDEX "export_jobs_company_status_idx" ON "saas_export_jobs" USING btree ("companyId","status","createdAt");;
--> statement-breakpoint
CREATE INDEX "farms_company_status_idx" ON "saas_farms" USING btree ("companyId","status","id");;
--> statement-breakpoint
CREATE INDEX "feed_item_price_history_item_date_id_idx" ON "saas_azal_feed_item_price_history" USING btree ("feedItemId","effectiveDate","id");;
--> statement-breakpoint
CREATE INDEX "feed_item_price_history_scope_date_idx" ON "saas_azal_feed_item_price_history" USING btree ("companyId","farmId","feedItemId","effectiveDate","id");;
--> statement-breakpoint
CREATE INDEX "feed_items_deleted_name_idx" ON "saas_azal_feed_items" USING btree ("deletedAt","name");;
--> statement-breakpoint
CREATE INDEX "feed_stock_ledger_farm_item_date_idx" ON "saas_azal_feed_stock_ledger" USING btree ("companyId","farmId","feedItemId","transactionDate","id");;
--> statement-breakpoint
CREATE INDEX "groups_farm_active_idx" ON "saas_azal_groups" USING btree ("companyId","farmId","isActive","deletedAt");;
--> statement-breakpoint
CREATE INDEX "idempotency_keys_expiry_idx" ON "saas_idempotency_keys" USING btree ("expiresAt");;
--> statement-breakpoint
CREATE INDEX "lambing_log_farm_date_idx" ON "saas_azal_lambing_log" USING btree ("companyId","farmId","birthDate","id");;
--> statement-breakpoint
CREATE INDEX "mfa_recovery_codes_credential_idx" ON "saas_mfa_recovery_codes" USING btree ("mfaCredentialId","usedAt");;
--> statement-breakpoint
CREATE INDEX "notification_receipts_unread_idx" ON "saas_azal_notification_receipts" USING btree ("companyId","companyMembershipId","readAt","id");;
--> statement-breakpoint
CREATE INDEX "notifications_company_time_idx" ON "saas_azal_notifications" USING btree ("companyId","createdAt","id");;
--> statement-breakpoint
CREATE INDEX "oauth_states_expiry_idx" ON "saas_oauth_states" USING btree ("expiresAt","consumedAt");;
--> statement-breakpoint
CREATE INDEX "outbox_events_claim_idx" ON "saas_outbox_events" USING btree ("status","nextAttemptAt","lockedUntil","id");;
--> statement-breakpoint
CREATE INDEX "owners_company_active_idx" ON "saas_azal_owners" USING btree ("companyId","isActive","deletedAt");;
--> statement-breakpoint
CREATE INDEX "platform_administrators_status_idx" ON "saas_platform_administrators" USING btree ("status","id");;
--> statement-breakpoint
CREATE INDEX "platform_sessions_active_admin_idx" ON "saas_platform_sessions" USING btree ("platformAdministratorId","revokedAt","expiresAt");;
--> statement-breakpoint
CREATE INDEX "platform_sessions_family_idx" ON "saas_platform_sessions" USING btree ("tokenFamilyId","revokedAt");;
--> statement-breakpoint
CREATE INDEX "pregnancy_records_tenant_due_idx" ON "saas_azal_pregnancy_records" USING btree ("companyId","farmId","status","expectedDueDate");;
--> statement-breakpoint
CREATE INDEX "ration_plans_scope_active_idx" ON "saas_azal_ration_plans" USING btree ("companyId","farmId","categoryId","feedItemId","isActive","deletedAt");;
--> statement-breakpoint
CREATE INDEX "sales_farm_date_idx" ON "saas_azal_sales" USING btree ("companyId","farmId","saleDate","id");;
--> statement-breakpoint
CREATE INDEX "security_events_company_time_idx" ON "saas_security_events" USING btree ("companyId","createdAt","id");;
--> statement-breakpoint
CREATE INDEX "security_events_severity_time_idx" ON "saas_security_events" USING btree ("severity","createdAt","id");;
--> statement-breakpoint
CREATE INDEX "security_events_request_idx" ON "saas_security_events" USING btree ("requestId");;
--> statement-breakpoint
CREATE INDEX "species_company_active_idx" ON "saas_azal_species" USING btree ("companyId","isActive","deletedAt");;
--> statement-breakpoint
CREATE INDEX "subscription_plans_status_idx" ON "saas_subscription_plans" USING btree ("status","code","planVersion");;
--> statement-breakpoint
CREATE INDEX "support_access_grants_company_status_idx" ON "saas_support_access_grants" USING btree ("companyId","status","expiresAt");;
--> statement-breakpoint
CREATE INDEX "support_access_grants_requester_status_idx" ON "saas_support_access_grants" USING btree ("requestedByPlatformAdministratorId","status","createdAt");;
--> statement-breakpoint
CREATE INDEX "tenant_files_company_status_idx" ON "saas_tenant_files" USING btree ("companyId","status","createdAt");;
--> statement-breakpoint
CREATE INDEX "tenant_restore_jobs_company_status_idx" ON "saas_tenant_restore_jobs" USING btree ("companyId","status","createdAt");;
--> statement-breakpoint
CREATE INDEX "tenant_sessions_active_user_idx" ON "saas_tenant_sessions" USING btree ("userId","revokedAt","expiresAt");;
--> statement-breakpoint
CREATE INDEX "tenant_sessions_family_idx" ON "saas_tenant_sessions" USING btree ("tokenFamilyId","revokedAt");;
--> statement-breakpoint
CREATE INDEX "usage_counters_period_idx" ON "saas_usage_counters" USING btree ("periodType","periodEnd","companyId");;
--> statement-breakpoint
CREATE INDEX "user_settings_user_company_idx" ON "saas_azal_user_settings" USING btree ("userId","companyId");;
--> statement-breakpoint
CREATE INDEX "vaccination_records_tenant_animal_due_idx" ON "saas_azal_vaccination_records" USING btree ("companyId","farmId","animalId","nextDueDate");;
--> statement-breakpoint
CREATE INDEX "weight_log_tenant_animal_date_idx" ON "saas_azal_weight_log" USING btree ("companyId","animalId","weighDate","id");;
--> statement-breakpoint
ALTER TABLE "saas_azal_animal_categories" ADD CONSTRAINT "animal_categories_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animal_categories" ADD CONSTRAINT "animal_categories_species_fk" FOREIGN KEY ("companyId","speciesId") REFERENCES "public"."saas_azal_species"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animal_categories" ADD CONSTRAINT "animal_categories_auto_target_fk" FOREIGN KEY ("companyId","autoStageTargetCategoryId") REFERENCES "public"."saas_azal_animal_categories"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animal_status_history" ADD CONSTRAINT "animal_status_history_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animal_status_history" ADD CONSTRAINT "animal_status_history_previous_status_fk" FOREIGN KEY ("companyId","previousStatusId") REFERENCES "public"."saas_azal_animal_statuses"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animal_status_history" ADD CONSTRAINT "animal_status_history_new_status_fk" FOREIGN KEY ("companyId","newStatusId") REFERENCES "public"."saas_azal_animal_statuses"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animal_statuses" ADD CONSTRAINT "animal_statuses_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animals" ADD CONSTRAINT "animals_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animals" ADD CONSTRAINT "animals_species_fk" FOREIGN KEY ("companyId","speciesId") REFERENCES "public"."saas_azal_species"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animals" ADD CONSTRAINT "animals_category_fk" FOREIGN KEY ("companyId","categoryId") REFERENCES "public"."saas_azal_animal_categories"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animals" ADD CONSTRAINT "animals_group_fk" FOREIGN KEY ("companyId","groupId") REFERENCES "public"."saas_azal_groups"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animals" ADD CONSTRAINT "animals_status_fk" FOREIGN KEY ("companyId","statusId") REFERENCES "public"."saas_azal_animal_statuses"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animals" ADD CONSTRAINT "animals_owner_fk" FOREIGN KEY ("companyId","ownerId") REFERENCES "public"."saas_azal_owners"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animals" ADD CONSTRAINT "animals_dam_fk" FOREIGN KEY ("companyId","damId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_animals" ADD CONSTRAINT "animals_sire_fk" FOREIGN KEY ("companyId","sireId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_audit_log" ADD CONSTRAINT "audit_log_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_audit_log" ADD CONSTRAINT "audit_log_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_audit_log" ADD CONSTRAINT "audit_log_membership_fk" FOREIGN KEY ("companyId","membershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_audit_log" ADD CONSTRAINT "audit_log_platform_admin_fk" FOREIGN KEY ("platformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_audit_log" ADD CONSTRAINT "audit_log_support_grant_fk" FOREIGN KEY ("companyId","supportAccessGrantId") REFERENCES "public"."saas_support_access_grants"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_auth_identities" ADD CONSTRAINT "auth_identities_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."saas_users"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_authentication_tokens" ADD CONSTRAINT "authentication_tokens_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."saas_users"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_authentication_tokens" ADD CONSTRAINT "authentication_tokens_identity_fk" FOREIGN KEY ("authIdentityId") REFERENCES "public"."saas_auth_identities"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_background_jobs" ADD CONSTRAINT "background_jobs_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_birth_types" ADD CONSTRAINT "birth_types_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_branding" ADD CONSTRAINT "company_branding_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_branding" ADD CONSTRAINT "company_branding_logo_file_fk" FOREIGN KEY ("companyId","logoTenantFileId") REFERENCES "public"."saas_tenant_files"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_branding" ADD CONSTRAINT "company_branding_favicon_file_fk" FOREIGN KEY ("companyId","faviconTenantFileId") REFERENCES "public"."saas_tenant_files"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_branding" ADD CONSTRAINT "company_branding_updated_by_fk" FOREIGN KEY ("companyId","updatedByMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_company_category_sequences" ADD CONSTRAINT "company_category_sequences_category_fk" FOREIGN KEY ("companyId","categoryId") REFERENCES "public"."saas_azal_animal_categories"("companyId","id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_company_category_sequences" ADD CONSTRAINT "company_category_sequences_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_feature_overrides" ADD CONSTRAINT "company_feature_overrides_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_feature_overrides" ADD CONSTRAINT "company_feature_overrides_feature_fk" FOREIGN KEY ("featureId") REFERENCES "public"."saas_feature_catalog"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_feature_overrides" ADD CONSTRAINT "company_feature_overrides_created_by_fk" FOREIGN KEY ("createdByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_feature_overrides" ADD CONSTRAINT "company_feature_overrides_revoked_by_fk" FOREIGN KEY ("revokedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_invitations" ADD CONSTRAINT "company_invitations_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_invitations" ADD CONSTRAINT "company_invitations_inviter_fk" FOREIGN KEY ("companyId","invitedByMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_invitations" ADD CONSTRAINT "company_invitations_platform_inviter_fk" FOREIGN KEY ("invitedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_invitations" ADD CONSTRAINT "company_invitations_accepted_by_fk" FOREIGN KEY ("acceptedByUserId") REFERENCES "public"."saas_users"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_memberships" ADD CONSTRAINT "company_memberships_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_memberships" ADD CONSTRAINT "company_memberships_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."saas_users"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_memberships" ADD CONSTRAINT "company_memberships_invited_by_fk" FOREIGN KEY ("companyId","invitedByMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_role_permissions" ADD CONSTRAINT "company_role_permissions_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_role_permissions" ADD CONSTRAINT "company_role_permissions_updated_by_fk" FOREIGN KEY ("companyId","updatedByMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_security_policies" ADD CONSTRAINT "company_security_policies_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_security_policies" ADD CONSTRAINT "company_security_policies_updated_by_fk" FOREIGN KEY ("companyId","updatedByMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_subscriptions" ADD CONSTRAINT "company_subscriptions_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_subscriptions" ADD CONSTRAINT "company_subscriptions_plan_fk" FOREIGN KEY ("subscriptionPlanId") REFERENCES "public"."saas_subscription_plans"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_company_subscriptions" ADD CONSTRAINT "company_subscriptions_changed_by_fk" FOREIGN KEY ("changedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_deletion_requests" ADD CONSTRAINT "deletion_requests_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_deletion_requests" ADD CONSTRAINT "deletion_requests_membership_fk" FOREIGN KEY ("companyId","requestedByMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_deletion_requests" ADD CONSTRAINT "deletion_requests_request_admin_fk" FOREIGN KEY ("requestedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_deletion_requests" ADD CONSTRAINT "deletion_requests_approval_admin_fk" FOREIGN KEY ("approvedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_email_log" ADD CONSTRAINT "email_log_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE set null ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_expense_categories" ADD CONSTRAINT "expense_categories_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_expense_sub_categories" ADD CONSTRAINT "expense_sub_categories_category_fk" FOREIGN KEY ("companyId","categoryId") REFERENCES "public"."saas_azal_expense_categories"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_expenses" ADD CONSTRAINT "expenses_category_fk" FOREIGN KEY ("companyId","categoryId") REFERENCES "public"."saas_azal_expense_categories"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_expenses" ADD CONSTRAINT "expenses_sub_category_fk" FOREIGN KEY ("companyId","subCategoryId") REFERENCES "public"."saas_azal_expense_sub_categories"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_expenses" ADD CONSTRAINT "expenses_head_fk" FOREIGN KEY ("companyId","headId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_expenses" ADD CONSTRAINT "expenses_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_export_jobs" ADD CONSTRAINT "export_jobs_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_export_jobs" ADD CONSTRAINT "export_jobs_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_export_jobs" ADD CONSTRAINT "export_jobs_membership_fk" FOREIGN KEY ("companyId","requestedByMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_export_jobs" ADD CONSTRAINT "export_jobs_platform_admin_fk" FOREIGN KEY ("requestedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_export_jobs" ADD CONSTRAINT "export_jobs_support_grant_fk" FOREIGN KEY ("companyId","supportAccessGrantId") REFERENCES "public"."saas_support_access_grants"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_export_jobs" ADD CONSTRAINT "export_jobs_file_fk" FOREIGN KEY ("companyId","tenantFileId") REFERENCES "public"."saas_tenant_files"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_farm_memberships" ADD CONSTRAINT "farm_memberships_company_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_farm_memberships" ADD CONSTRAINT "farm_memberships_company_membership_fk" FOREIGN KEY ("companyId","companyMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_farms" ADD CONSTRAINT "farms_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_farms" ADD CONSTRAINT "farms_created_by_fk" FOREIGN KEY ("companyId","createdByMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_farms" ADD CONSTRAINT "farms_deleted_by_fk" FOREIGN KEY ("companyId","deletedByMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_feed_item_price_history" ADD CONSTRAINT "feed_item_price_history_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_feed_item_price_history" ADD CONSTRAINT "feed_item_price_history_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_feed_item_price_history" ADD CONSTRAINT "feed_item_price_history_feed_item_fk" FOREIGN KEY ("companyId","feedItemId") REFERENCES "public"."saas_azal_feed_items"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_feed_items" ADD CONSTRAINT "feed_items_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_feed_stock_ledger" ADD CONSTRAINT "feed_stock_ledger_feed_item_fk" FOREIGN KEY ("companyId","feedItemId") REFERENCES "public"."saas_azal_feed_items"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_feed_stock_ledger" ADD CONSTRAINT "feed_stock_ledger_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_groups" ADD CONSTRAINT "groups_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_groups" ADD CONSTRAINT "groups_species_fk" FOREIGN KEY ("companyId","speciesId") REFERENCES "public"."saas_azal_species"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_groups" ADD CONSTRAINT "groups_category_fk" FOREIGN KEY ("companyId","categoryId") REFERENCES "public"."saas_azal_animal_categories"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_idempotency_keys" ADD CONSTRAINT "idempotency_keys_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."saas_users"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_lambing_log" ADD CONSTRAINT "lambing_log_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_lambing_log" ADD CONSTRAINT "lambing_log_dam_fk" FOREIGN KEY ("companyId","damId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_lambing_log" ADD CONSTRAINT "lambing_log_sire_fk" FOREIGN KEY ("companyId","sireId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_lambing_log" ADD CONSTRAINT "lambing_log_species_fk" FOREIGN KEY ("companyId","speciesId") REFERENCES "public"."saas_azal_species"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_lambing_log" ADD CONSTRAINT "lambing_log_category_fk" FOREIGN KEY ("companyId","categoryId") REFERENCES "public"."saas_azal_animal_categories"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_lambing_log" ADD CONSTRAINT "lambing_log_group_fk" FOREIGN KEY ("companyId","groupId") REFERENCES "public"."saas_azal_groups"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_lambing_log" ADD CONSTRAINT "lambing_log_birth_type_fk" FOREIGN KEY ("companyId","birthTypeId") REFERENCES "public"."saas_azal_birth_types"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_lambing_log" ADD CONSTRAINT "lambing_log_promoted_animal_fk" FOREIGN KEY ("companyId","promotedHeadId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_legacy_user_links" ADD CONSTRAINT "saas_legacy_user_links_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_legacy_user_links" ADD CONSTRAINT "saas_legacy_user_links_user_fk" FOREIGN KEY ("saasUserId") REFERENCES "public"."saas_users"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_mfa_credentials" ADD CONSTRAINT "mfa_credentials_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."saas_users"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_credential_fk" FOREIGN KEY ("mfaCredentialId") REFERENCES "public"."saas_mfa_credentials"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_notification_receipts" ADD CONSTRAINT "notification_receipts_membership_fk" FOREIGN KEY ("companyId","companyMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_notification_receipts" ADD CONSTRAINT "notification_receipts_notification_fk" FOREIGN KEY ("companyId","notificationId") REFERENCES "public"."saas_azal_notifications"("companyId","id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_notifications" ADD CONSTRAINT "notifications_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_notifications" ADD CONSTRAINT "notifications_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_notifications" ADD CONSTRAINT "notifications_recipient_fk" FOREIGN KEY ("companyId","userId") REFERENCES "public"."saas_company_memberships"("companyId","userId") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_outbox_events" ADD CONSTRAINT "outbox_events_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_owners" ADD CONSTRAINT "owners_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_password_credentials" ADD CONSTRAINT "password_credentials_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."saas_users"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_plan_entitlements" ADD CONSTRAINT "plan_entitlements_plan_fk" FOREIGN KEY ("subscriptionPlanId") REFERENCES "public"."saas_subscription_plans"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_plan_entitlements" ADD CONSTRAINT "plan_entitlements_feature_fk" FOREIGN KEY ("featureId") REFERENCES "public"."saas_feature_catalog"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_platform_administrator_roles" ADD CONSTRAINT "platform_administrator_roles_administrator_fk" FOREIGN KEY ("platformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_platform_administrator_roles" ADD CONSTRAINT "platform_administrator_roles_role_fk" FOREIGN KEY ("platformRoleId") REFERENCES "public"."saas_platform_roles"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_platform_administrator_roles" ADD CONSTRAINT "platform_administrator_roles_granted_by_fk" FOREIGN KEY ("grantedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_platform_administrators" ADD CONSTRAINT "platform_administrators_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."saas_users"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_platform_administrators" ADD CONSTRAINT "platform_administrators_granted_by_fk" FOREIGN KEY ("grantedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_platform_identities" ADD CONSTRAINT "platform_identities_administrator_fk" FOREIGN KEY ("platformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_role_fk" FOREIGN KEY ("platformRoleId") REFERENCES "public"."saas_platform_roles"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_permission_fk" FOREIGN KEY ("platformPermissionId") REFERENCES "public"."saas_platform_permissions"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_platform_sessions" ADD CONSTRAINT "platform_sessions_administrator_fk" FOREIGN KEY ("platformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_pregnancy_records" ADD CONSTRAINT "pregnancy_records_animal_fk" FOREIGN KEY ("companyId","animalId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_pregnancy_records" ADD CONSTRAINT "pregnancy_records_sire_fk" FOREIGN KEY ("companyId","sireId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_pregnancy_records" ADD CONSTRAINT "pregnancy_records_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_pregnancy_records" ADD CONSTRAINT "pregnancy_records_outcome_fk" FOREIGN KEY ("companyId","outcomeLambingLogId") REFERENCES "public"."saas_azal_lambing_log"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_ration_plans" ADD CONSTRAINT "ration_plans_category_fk" FOREIGN KEY ("companyId","categoryId") REFERENCES "public"."saas_azal_animal_categories"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_ration_plans" ADD CONSTRAINT "ration_plans_feed_item_fk" FOREIGN KEY ("companyId","feedItemId") REFERENCES "public"."saas_azal_feed_items"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_ration_plans" ADD CONSTRAINT "ration_plans_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_sales" ADD CONSTRAINT "sales_animal_fk" FOREIGN KEY ("companyId","animalId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_sales" ADD CONSTRAINT "sales_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_security_events" ADD CONSTRAINT "security_events_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_security_events" ADD CONSTRAINT "security_events_platform_admin_fk" FOREIGN KEY ("platformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_security_events" ADD CONSTRAINT "security_events_support_grant_fk" FOREIGN KEY ("companyId","supportAccessGrantId") REFERENCES "public"."saas_support_access_grants"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_species" ADD CONSTRAINT "species_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_subscription_plans" ADD CONSTRAINT "subscription_plans_created_by_fk" FOREIGN KEY ("createdByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_support_access_approvals" ADD CONSTRAINT "support_access_approvals_grant_fk" FOREIGN KEY ("supportAccessGrantId") REFERENCES "public"."saas_support_access_grants"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_support_access_approvals" ADD CONSTRAINT "support_access_approvals_administrator_fk" FOREIGN KEY ("platformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_support_access_grants" ADD CONSTRAINT "support_access_grants_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_support_access_grants" ADD CONSTRAINT "support_access_grants_requester_fk" FOREIGN KEY ("requestedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_support_access_grants" ADD CONSTRAINT "support_access_grants_revoked_by_fk" FOREIGN KEY ("revokedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_system_settings" ADD CONSTRAINT "system_settings_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_files" ADD CONSTRAINT "tenant_files_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_files" ADD CONSTRAINT "tenant_files_uploader_fk" FOREIGN KEY ("companyId","uploadedByMembershipId") REFERENCES "public"."saas_company_memberships"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_files" ADD CONSTRAINT "tenant_files_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_files" ADD CONSTRAINT "tenant_files_generated_job_fk" FOREIGN KEY ("companyId","generatedByBackgroundJobId") REFERENCES "public"."saas_background_jobs"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_restore_jobs" ADD CONSTRAINT "tenant_restore_jobs_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_restore_jobs" ADD CONSTRAINT "tenant_restore_jobs_source_file_fk" FOREIGN KEY ("companyId","sourceTenantFileId") REFERENCES "public"."saas_tenant_files"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_restore_jobs" ADD CONSTRAINT "tenant_restore_jobs_pre_export_fk" FOREIGN KEY ("companyId","preRestoreExportJobId") REFERENCES "public"."saas_export_jobs"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_restore_jobs" ADD CONSTRAINT "tenant_restore_jobs_request_admin_fk" FOREIGN KEY ("requestedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_restore_jobs" ADD CONSTRAINT "tenant_restore_jobs_approval_admin_fk" FOREIGN KEY ("approvedByPlatformAdministratorId") REFERENCES "public"."saas_platform_administrators"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_sessions" ADD CONSTRAINT "tenant_sessions_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."saas_users"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_tenant_sessions" ADD CONSTRAINT "tenant_sessions_last_company_fk" FOREIGN KEY ("lastSelectedCompanyId") REFERENCES "public"."saas_companies"("id") ON DELETE set null ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_usage_counters" ADD CONSTRAINT "usage_counters_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_usage_counters" ADD CONSTRAINT "usage_counters_feature_fk" FOREIGN KEY ("featureId") REFERENCES "public"."saas_feature_catalog"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_user_settings" ADD CONSTRAINT "user_settings_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_user_settings" ADD CONSTRAINT "user_settings_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."saas_users"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_vaccination_records" ADD CONSTRAINT "vaccination_records_animal_fk" FOREIGN KEY ("companyId","animalId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_vaccination_records" ADD CONSTRAINT "vaccination_records_vaccine_fk" FOREIGN KEY ("companyId","vaccineId") REFERENCES "public"."saas_azal_vaccines"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_vaccination_records" ADD CONSTRAINT "vaccination_records_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_vaccines" ADD CONSTRAINT "vaccines_company_fk" FOREIGN KEY ("companyId") REFERENCES "public"."saas_companies"("id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_weight_log" ADD CONSTRAINT "weight_log_animal_fk" FOREIGN KEY ("companyId","animalId") REFERENCES "public"."saas_azal_animals"("companyId","id") ON DELETE restrict ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "saas_azal_weight_log" ADD CONSTRAINT "weight_log_farm_fk" FOREIGN KEY ("companyId","farmId") REFERENCES "public"."saas_farms"("companyId","id") ON DELETE restrict ON UPDATE no action;;
