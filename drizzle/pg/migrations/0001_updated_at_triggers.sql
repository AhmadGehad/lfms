-- Reproduces MySQL ON UPDATE CURRENT_TIMESTAMP for 38 columns.
-- Bumps only when the row actually changed and the caller did not set the
-- column itself, matching MySQL rather than a naive always-overwrite trigger.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)
     AND NEW."updatedAt" IS NOT DISTINCT FROM OLD."updatedAt" THEN
    NEW."updatedAt" := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "saas_users_set_updated_at" BEFORE UPDATE ON "saas_users" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_companies_set_updated_at" BEFORE UPDATE ON "saas_companies" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_farms_set_updated_at" BEFORE UPDATE ON "saas_farms" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_company_memberships_set_updated_at" BEFORE UPDATE ON "saas_company_memberships" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_legacy_user_links_set_updated_at" BEFORE UPDATE ON "saas_legacy_user_links" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_company_role_permissions_set_updated_at" BEFORE UPDATE ON "saas_company_role_permissions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_company_security_policies_set_updated_at" BEFORE UPDATE ON "saas_company_security_policies" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_platform_administrators_set_updated_at" BEFORE UPDATE ON "saas_platform_administrators" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_platform_roles_set_updated_at" BEFORE UPDATE ON "saas_platform_roles" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_feature_catalog_set_updated_at" BEFORE UPDATE ON "saas_feature_catalog" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_subscription_plans_set_updated_at" BEFORE UPDATE ON "saas_subscription_plans" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_plan_entitlements_set_updated_at" BEFORE UPDATE ON "saas_plan_entitlements" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_company_subscriptions_set_updated_at" BEFORE UPDATE ON "saas_company_subscriptions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_company_feature_overrides_set_updated_at" BEFORE UPDATE ON "saas_company_feature_overrides" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_usage_counters_set_updated_at" BEFORE UPDATE ON "saas_usage_counters" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_support_access_grants_set_updated_at" BEFORE UPDATE ON "saas_support_access_grants" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_company_branding_set_updated_at" BEFORE UPDATE ON "saas_company_branding" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_deletion_requests_set_updated_at" BEFORE UPDATE ON "saas_deletion_requests" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_user_settings_set_updated_at" BEFORE UPDATE ON "saas_azal_user_settings" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_role_permissions_set_updated_at" BEFORE UPDATE ON "saas_azal_role_permissions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_species_set_updated_at" BEFORE UPDATE ON "saas_azal_species" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_animal_categories_set_updated_at" BEFORE UPDATE ON "saas_azal_animal_categories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_company_category_sequences_set_updated_at" BEFORE UPDATE ON "saas_azal_company_category_sequences" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_animal_statuses_set_updated_at" BEFORE UPDATE ON "saas_azal_animal_statuses" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_groups_set_updated_at" BEFORE UPDATE ON "saas_azal_groups" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_owners_set_updated_at" BEFORE UPDATE ON "saas_azal_owners" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "capital_investors_set_updated_at" BEFORE UPDATE ON "capital_investors" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_birth_types_set_updated_at" BEFORE UPDATE ON "saas_azal_birth_types" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_feed_items_set_updated_at" BEFORE UPDATE ON "saas_azal_feed_items" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_vaccines_set_updated_at" BEFORE UPDATE ON "saas_azal_vaccines" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_vaccination_records_set_updated_at" BEFORE UPDATE ON "saas_azal_vaccination_records" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_expense_categories_set_updated_at" BEFORE UPDATE ON "saas_azal_expense_categories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_expense_sub_categories_set_updated_at" BEFORE UPDATE ON "saas_azal_expense_sub_categories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_system_settings_set_updated_at" BEFORE UPDATE ON "saas_azal_system_settings" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_animals_set_updated_at" BEFORE UPDATE ON "saas_azal_animals" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_ration_plans_set_updated_at" BEFORE UPDATE ON "saas_azal_ration_plans" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_expenses_set_updated_at" BEFORE UPDATE ON "saas_azal_expenses" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "saas_azal_pregnancy_records_set_updated_at" BEFORE UPDATE ON "saas_azal_pregnancy_records" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
