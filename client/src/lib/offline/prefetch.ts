/**
 * Warms the persisted cache so screens work offline before they have been opened.
 *
 * Without this, offline reads would only cover pages visited while online —
 * useless for someone who drives to a paddock and only then opens Vaccinations.
 *
 * Scope is the **active farm** (requests are already farm-scoped by the
 * `X-LFMS-Farm` header) and the unfiltered view of each list. Filtered views
 * still need the network, which is correct: they are a different dataset.
 *
 * Key matching matters here. React Query hashes keys with `JSON.stringify`,
 * which drops `undefined` properties, so a page calling
 * `list.useQuery({ speciesId: undefined, ownerId: undefined })` produces the
 * same key as a prefetch of `{}` — that is why both designs' default list views
 * are covered by one entry despite passing different property sets. A procedure
 * called as `useQuery()` with no argument, however, hashes differently from
 * `{}`, so those are listed separately.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { TRPCClient } from "@trpc/client";
import type { AppRouter } from "../../../../server/routers";

/** Procedures whose pages call `useQuery()` with no input. */
const NO_INPUT_QUERIES = [
  // Boot-critical. TenantSurface renders a loading state until suspensionStatus
  // resolves and the shells need `me`, so without cached copies an offline
  // launch can sit on a near-empty screen.
  "auth.me",
  "auth.suspensionStatus",
  "auth.tenantContext",
  "tenancy.publicBranding",
  // Reference data — every offline form needs these to render its selects.
  "config.getSpecies",
  "config.getCategories",
  "config.getGroups",
  "config.getStatuses",
  "config.getOwnerOptions",
  "config.getVaccines",
  "config.getFeedItems",
  "config.getBirthTypes",
  "config.getSettings",
  "config.getDisplaySettings",
  "config.getCompanyBranding",
  "config.getExpenseCategories",
  "config.getExpenseSubCategories",
  "config.getAllFeedItemPrices",
  // Animal picker used by the weight, vaccination and pregnancy forms.
  "animals.lookup",
  // Feed screens.
  "feed.getStockStatus",
  "feed.getStockLedger",
  "feed.getRationPlans",
] as const;

/** Procedures whose pages pass an all-optional object; `{}` matches unfiltered. */
const EMPTY_INPUT_QUERIES = [
  "animals.list",
  "animals.listFattening",
  "vaccination.getVaccinationRecords",
  "pregnancy.summary",
  "breeding.summary",
  "breeding.listLambing",
  "expenses.list",
  "dashboard.getHeadCountByCategory",
  "dashboard.getKPIs",
  "notifications.list",
] as const;

/** Inputs a page passes as a fixed literal, so the prefetch must match exactly. */
const LITERAL_INPUT_QUERIES = [
  { path: "animals.lookup", input: { isActive: true } },
  { path: "config.getOwners", input: { activeOnly: false } },
  { path: "vaccination.getUpcomingVaccinations", input: { days: 30 } },
  { path: "pregnancy.getUpcoming", input: { days: 30 } },
] as const;

type QueryNode = { query: (input: unknown) => Promise<unknown> };

function resolveQuery(client: TRPCClient<AppRouter>, path: string): QueryNode | null {
  const node = path
    .split(".")
    .reduce<Record<string, unknown> | undefined>(
      (current, segment) => current?.[segment] as Record<string, unknown> | undefined,
      client as unknown as Record<string, unknown>,
    );
  return typeof node?.["query"] === "function" ? (node as unknown as QueryNode) : null;
}

/** tRPC's query key for a path and input. */
function queryKey(path: string, input: unknown) {
  const segments = path.split(".");
  return input === undefined
    ? [segments, { type: "query" }]
    : [segments, { input, type: "query" }];
}

async function warm(
  queryClient: QueryClient,
  client: TRPCClient<AppRouter>,
  path: string,
  input: unknown,
) {
  const node = resolveQuery(client, path);
  if (!node) return;
  try {
    await queryClient.prefetchQuery({
      queryKey: queryKey(path, input),
      queryFn: () => node.query(input),
    });
  } catch {
    // One unreachable or unauthorised procedure must not abort the rest: a
    // viewer without feed permission should still get their animal lists cached.
  }
}

/**
 * Fetches the offline read set into the cache.
 *
 * Deliberately sequential in small batches rather than all at once: this runs on
 * a phone that may be on a weak connection, and saturating it would slow the
 * screen the user is actually looking at.
 */
export async function prefetchOfflineReadSet(
  queryClient: QueryClient,
  client: TRPCClient<AppRouter>,
) {
  const jobs: Array<{ path: string; input: unknown }> = [
    ...NO_INPUT_QUERIES.map(path => ({ path, input: undefined })),
    ...EMPTY_INPUT_QUERIES.map(path => ({ path, input: {} })),
    ...LITERAL_INPUT_QUERIES.map(entry => ({ path: entry.path, input: entry.input })),
  ];

  const BATCH = 4;
  for (let index = 0; index < jobs.length; index += BATCH) {
    await Promise.all(
      jobs.slice(index, index + BATCH).map(job => warm(queryClient, client, job.path, job.input)),
    );
  }
}

/** Exposed for the coverage test. */
export const OFFLINE_PREFETCH_PATHS = [
  ...NO_INPUT_QUERIES,
  ...EMPTY_INPUT_QUERIES,
  ...LITERAL_INPUT_QUERIES.map(entry => entry.path),
] as const;

export { queryKey as offlineQueryKey };
