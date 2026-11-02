-- The photo taken when a worker acts on a task, kept beside the name-pick photos so
-- that deleting a day and the 30-day purge cover both. Additive: code without these
-- columns keeps working during the rollout.
ALTER TABLE "saas_azal_worker_checkins" ADD COLUMN IF NOT EXISTS "taskId" integer;
--> statement-breakpoint
ALTER TABLE "saas_azal_worker_checkins" ADD COLUMN IF NOT EXISTS "taskAction" varchar(20);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_checkins_task_fk') THEN
    ALTER TABLE "saas_azal_worker_checkins" ADD CONSTRAINT "worker_checkins_task_fk"
      FOREIGN KEY ("taskId") REFERENCES "saas_azal_tasks" ("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_checkins_task_idx"
  ON "saas_azal_worker_checkins" ("companyId", "taskId")
  WHERE "taskId" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_checkins_photo_age_idx"
  ON "saas_azal_worker_checkins" ("createdAt")
  WHERE "photoKey" IS NOT NULL;
