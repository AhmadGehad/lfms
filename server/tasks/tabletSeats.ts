import { sql } from "drizzle-orm";
import { companyMemberships } from "../../drizzle/schema";
import { tabletAccounts } from "../../drizzle/schema.workerTasks";

/** A farm's tablet login isn't a person using up a seat. A worker with their own login is. */
export const notATablet = sql`NOT EXISTS (SELECT 1 FROM ${tabletAccounts} t WHERE t."companyId" = ${companyMemberships.companyId} AND t."userId" = ${companyMemberships.userId})`;
