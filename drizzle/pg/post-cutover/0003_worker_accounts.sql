-- Links a task worker to the login an administrator added with the worker role,
-- so that login shows up on the owner's Workers tab by itself. Manual names stay
-- unlinked. Additive: code without this column keeps working during the rollout.
ALTER TABLE "saas_azal_workers"
  ADD COLUMN IF NOT EXISTS "userId" integer REFERENCES "saas_users" ("id") ON DELETE SET NULL;
--> statement-breakpoint
-- Set when the login went away, not when the owner switched the worker off, so the
-- worker comes back by themselves if the login does.
ALTER TABLE "saas_azal_workers"
  ADD COLUMN IF NOT EXISTS "loginGone" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workers_farm_user_unique"
  ON "saas_azal_workers" ("companyId", "farmId", "userId")
  WHERE "userId" IS NOT NULL;
