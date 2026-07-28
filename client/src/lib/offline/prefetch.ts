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
 * Per-animal queries the profile page needs — the full set both designs render,
 * every tab included. Prefetched for every cached animal (capped) because a
 * profile opened for the first time while offline otherwise has nothing at all —
 * the field workflow is exactly "walk to the animal, open its profile, record a
 * weight".
 *
 * Note on photos: `getPhotoUrl` caches the storage URL, but the image bytes are
 * a cross-origin fetch the service worker does not cache, so the picture itself
 * may still be missing offline unless the browser's own cache has it.
 */
export const ANIMAL_DETAIL_QUERIES = [
  { path: "animals.getById", input: (id: number) => ({ id }) },
  { path: "animals.getPhotoUrl", input: (id: number) => ({ id }) },
  { path: "animals.getWeightLog", input: (id: number) => ({ animalId: id }) },
  { path: "animals.getPnL", input: (id: number) => ({ animalId: id }) },
  { path: "animals.getLineage", input: (id: number) => ({ animalId: id }) },
  { path: "animals.getAnimalSales", input: (id: number) => ({ animalId: id }) },
  { path: "animals.getStatusHistory", input: (id: number) => ({ animalId: id }) },
  { path: "animals.getExpenseHistory", input: (id: number) => ({ animalId: id }) },
  { path: "animals.getFeedHistory", input: (id: number) => ({ animalId: id }) },
  { path: "vaccination.getVaccinationRecords", input: (id: number) => ({ animalId: id }) },
  { path: "pregnancy.byAnimal", input: (id: number) => ({ animalId: id }) },
  { path: "pregnancy.reproductiveHistory", input: (id: number) => ({ animalId: id }) },
] as const;

/**
 * Bound on how many animals get their profile data prefetched. These queries go
 * through httpBatchLink, so a batch of them collapses into one HTTP request —
 * but an unbounded farm would still turn the warm-up into a hammering.
 */
export const ANIMAL_DETAIL_PREFETCH_LIMIT = 200;

/** Ids from the already-cached unfiltered animal list. */
function cachedAnimalIds(queryClient: QueryClient): number[] {
  const rows = queryClient.getQueryData(queryKey("animals.list", {}) as unknown[]);
  if (!Array.isArray(rows)) return [];
  return rows
    .map(row => (row as { animal?: { id?: unknown } }).animal?.id)
    .filter((id): id is number => typeof id === "number")
    .slice(0, ANIMAL_DETAIL_PREFETCH_LIMIT);
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

  // Second pass, after the list is cached: profile data per animal. A larger
  // batch is fine here because the batch link folds each group into a single
  // HTTP request.
  const detailJobs = cachedAnimalIds(queryClient).flatMap(id =>
    ANIMAL_DETAIL_QUERIES.map(query => ({ path: query.path, input: query.input(id) })),
  );
  const DETAIL_BATCH = 15;
  for (let index = 0; index < detailJobs.length; index += DETAIL_BATCH) {
    await Promise.all(
      detailJobs
        .slice(index, index + DETAIL_BATCH)
        .map(job => warm(queryClient, client, job.path, job.input)),
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
