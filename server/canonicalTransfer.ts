import { and, eq } from "drizzle-orm";
import { animalCategories, animals, farms, lambingLog } from "../drizzle/schema";
import type { DbOrTx } from "./db";
import {
  CANONICAL_TABLES,
  getCanonicalTableColumns,
  type CanonicalWorkbookData,
} from "./excelDataContract";
import { requireTenantUserContext } from "./tenancy/runtime";
import type { TenantContext } from "../shared/tenancy";
import { generatePublicId } from "./tenancy/publicIds";
import { tenantScope } from "./tenancy/scope";
import { assertWithinLimit, getEffectiveLimit, lockCompanyQuota } from "./entitlements/limits";

export type ImportMode = "append" | "replace";

export type TransferStat = {
  table: string;
  applied: number;
  skipped: number;
};

type ApplyCanonicalDataOptions = {
  excludedTables?: ReadonlySet<string>;
  scope?: CanonicalTransferScope;
  skipQuotaChecks?: boolean;
};

export type CanonicalTransferScope = Pick<
  TenantContext,
  "companyId" | "farmAccessMode" | "accessibleFarmIds" | "selectedFarmId"
>;

function transferTenant(scope?: CanonicalTransferScope): CanonicalTransferScope {
  return scope ?? requireTenantUserContext();
}

const TENANT_EXCLUDED_TABLES = new Set(["users", "role_permissions", "audit_log"]);

function activeAnimalRow(row: Record<string, unknown>) {
  return row.deletedAt === null || row.deletedAt === undefined || row.deletedAt === "";
}

async function enforceAnimalImportLimit(
  tx: DbOrTx,
  rowsByTable: CanonicalWorkbookData,
  mode: ImportMode,
  tenant: CanonicalTransferScope,
) {
  await lockCompanyQuota(tx, tenant.companyId);
  const imported = rowsByTable.get("animals") ?? [];
  const limit = await getEffectiveLimit(tx, tenant.companyId, "animals_limit");
  if (mode === "replace") {
    assertWithinLimit(0, imported.filter(activeAnimalRow).length, limit, "animals");
    return;
  }

  const existing = await tx.select({
    id: animals.id,
    animalId: animals.animalId,
    deletedAt: animals.deletedAt,
  }).from(animals).where(eq(animals.companyId, tenant.companyId));
  const existingIds = new Set(existing.map(row => Number(row.id)));
  const existingAnimalIds = new Set(existing.map(row => String(row.animalId).toUpperCase()));
  const additions = imported.filter(row => {
    if (!activeAnimalRow(row)) return false;
    const id = numericId(row.id);
    const animalId = String(row.animalId ?? "").toUpperCase();
    return (id === null || !existingIds.has(id)) && (!animalId || !existingAnimalIds.has(animalId));
  }).length;
  const current = existing.filter(row => activeAnimalRow(row as Record<string, unknown>)).length;
  assertWithinLimit(current, additions, limit, "animals");
}

function transferScope(tenant: CanonicalTransferScope, table: any) {
  return tenant.farmAccessMode === "all"
    ? eq(table.companyId, tenant.companyId)
    : tenantScope(tenant as TenantContext, table);
}

function scopedImportedRow(
  table: any,
  row: Record<string, unknown>,
  allowedFarmIds: ReadonlySet<number>,
  tenant: CanonicalTransferScope,
) {
  const result: Record<string, unknown> = { ...row, companyId: tenant.companyId };
  if (table.publicId) result.publicId = generatePublicId();
  if (table.version) result.version = 1;
  if (table.farmId) {
    const suppliedFarmId = result.farmId;
    if ((suppliedFarmId === null || suppliedFarmId === undefined || suppliedFarmId === "") && !table.farmId.notNull) {
      result.farmId = null;
      return result;
    }
    const farmId = Number(suppliedFarmId ?? tenant.selectedFarmId);
    if (!Number.isInteger(farmId) || !allowedFarmIds.has(farmId)) {
      throw new Error("Backup contains a farm outside the current company scope");
    }
    result.farmId = farmId;
  }
  return result;
}

function comparable(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function rowsMatch(imported: Record<string, unknown>, existing: Record<string, unknown>, columnNames: string[]) {
  return columnNames.every(name => comparable(imported[name]) === comparable(existing[name]));
}

function numericId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

async function normalizeBirthIntegrity(
  tx: DbOrTx,
  rowsByTable: CanonicalWorkbookData,
  mode: ImportMode,
  tenant: CanonicalTransferScope,
) {
  rowsByTable.set(
    "vaccination_records",
    (rowsByTable.get("vaccination_records") ?? []).map(row => ({
      ...row,
      notifyBeforeNext: row.notifyBeforeNext ?? 7,
      notifyBeforeBooster: row.notifyBeforeBooster ?? 7,
    })),
  );

  const importedCategories = (rowsByTable.get("animal_categories") ?? [])
    .map(row => ({ ...row }));
  const categoriesMissingLambSequence = new Set<number>();
  for (const category of importedCategories) {
    if (category.lambIdSequence === undefined) {
      const categoryId = numericId(category.id);
      if (categoryId !== null) categoriesMissingLambSequence.add(categoryId);
      category.lambIdSequence = 0;
    }
  }
  rowsByTable.set("animal_categories", importedCategories);

  let existingCategories: Record<string, unknown>[] = [];
  let existingAnimals: Record<string, unknown>[] = [];
  let existingBirths: Record<string, unknown>[] = [];
  if (mode === "append") {
    existingCategories = await tx.select().from(animalCategories)
      .where(eq(animalCategories.companyId, tenant.companyId));
    existingAnimals = await tx.select().from(animals)
      .where(transferScope(tenant, animals));
    existingBirths = await tx.select().from(lambingLog)
      .where(transferScope(tenant, lambingLog));
  }
  const categories = [...existingCategories, ...importedCategories];
  const existingCategoryById = new Map(
    existingCategories.map(row => [numericId(row.id), row]),
  );
  const importedAnimals = (rowsByTable.get("animals") ?? []).map(row => ({ ...row }));
  const allAnimals = [...existingAnimals, ...importedAnimals];
  const categoryById = new Map(categories.map(row => [numericId(row.id), row]));
  const animalById = new Map(allAnimals.map(row => [numericId(row.id), row]));
  const categoriesByPrefix = Array.from(categoryById.values())
    .filter(row => typeof row.idPrefix === "string" && row.idPrefix.length > 0)
    .sort((a, b) => String(b.idPrefix).length - String(a.idPrefix).length);

  const birthByPromotedHead = new Map<number, number>();
  for (const birth of existingBirths) {
    const promotedHeadId = numericId(birth.promotedHeadId);
    const birthId = numericId(birth.id);
    if (promotedHeadId !== null && birthId !== null) {
      birthByPromotedHead.set(promotedHeadId, birthId);
    }
  }

  const importedBirths = (rowsByTable.get("lambing_log") ?? []).map(source => {
    const birth = { ...source };
    const birthId = numericId(birth.id);
    const promotedHeadId = numericId(birth.promotedHeadId);
    const promotedAnimal = promotedHeadId !== null
      ? animalById.get(promotedHeadId)
      : undefined;
    if (promotedHeadId !== null || birth.promotedAnimalCode) {
      birth.isPromoted = true;
    }
    if (birth.isPromoted) {
      birth.deletedAt = null;
      birth.deletedBy = null;
    }
    if (promotedAnimal) {
      birth.speciesId = promotedAnimal.speciesId ?? birth.speciesId ?? null;
      birth.categoryId = promotedAnimal.categoryId ?? birth.categoryId ?? null;
      birth.damId = promotedAnimal.damId ?? null;
      birth.sireId = promotedAnimal.sireId ?? null;
      birth.promotedAnimalCode = promotedAnimal.animalId ?? birth.promotedAnimalCode ?? null;
      birth.isPromoted = true;
      birth.deletedAt = null;
      birth.deletedBy = null;
    }

    const dam = numericId(birth.damId) !== null
      ? animalById.get(numericId(birth.damId))
      : undefined;
    birth.speciesId ??= dam?.speciesId ?? null;
    birth.categoryId ??= dam?.categoryId ?? null;

    if (birth.categoryId === null || birth.categoryId === undefined) {
      const lambId = String(birth.lambId ?? "");
      const matchingCategories = categoriesByPrefix.filter(category =>
        lambId.startsWith(String(category.idPrefix)));
      const longestPrefixLength = String(
        matchingCategories[0]?.idPrefix ?? "",
      ).length;
      const longestMatches = matchingCategories.filter(category =>
        String(category.idPrefix).length === longestPrefixLength);
      birth.categoryId = longestMatches.length === 1
        ? longestMatches[0]?.id ?? null
        : null;
    }
    const category = categoryById.get(numericId(birth.categoryId));
    birth.speciesId ??= category?.speciesId ?? null;
    birth.promotedAnimalCode ??= promotedAnimal?.animalId ?? null;
    birth.promotedAnimalPurgedAt ??= null;
    if (birth.isPromoted && !promotedAnimal) {
      if (promotedHeadId !== null) birth.promotedHeadId = null;
      birth.promotedAnimalPurgedAt ??= new Date();
    }

    const normalizedPromotedHeadId = numericId(birth.promotedHeadId);
    if (normalizedPromotedHeadId !== null) {
      const existingBirthId = birthByPromotedHead.get(normalizedPromotedHeadId);
      if (existingBirthId !== undefined && existingBirthId !== birthId) {
        throw new Error(
          `lambing_log: promotedHeadId=${normalizedPromotedHeadId} is linked to multiple birth records`,
        );
      }
      if (birthId !== null) {
        birthByPromotedHead.set(normalizedPromotedHeadId, birthId);
      }
    }
    return birth;
  });
  rowsByTable.set("lambing_log", importedBirths);

  if (categoriesMissingLambSequence.size > 0) {
    const allBirths = [...existingBirths, ...importedBirths];
    for (const category of importedCategories) {
      const categoryId = numericId(category.id);
      if (categoryId === null || !categoriesMissingLambSequence.has(categoryId)) continue;
      const prefix = String(category.idPrefix ?? "");
      let maxSequence = numericId(
        existingCategoryById.get(categoryId)?.lambIdSequence,
      ) ?? 0;
      for (const birth of allBirths) {
        const lambId = String(birth.lambId ?? "");
        if (!prefix || !lambId.startsWith(prefix)) continue;
        const suffix = lambId.slice(prefix.length);
        if (/^\d+$/.test(suffix)) {
          const sequence = Number(suffix);
          if (Number.isSafeInteger(sequence)) {
            maxSequence = Math.max(maxSequence, Math.min(sequence, 2_147_483_646));
          }
        }
      }
      category.lambIdSequence = maxSequence;
    }
  }
}

export async function readAllCanonicalTables(
  db: DbOrTx,
  scope?: CanonicalTransferScope,
): Promise<CanonicalWorkbookData> {
  const rows: CanonicalWorkbookData = new Map();
  const tenant = transferTenant(scope);
  if (tenant.farmAccessMode !== "all") {
    throw new Error("Full data export requires access to all company farms");
  }
  for (const spec of CANONICAL_TABLES) {
    if (TENANT_EXCLUDED_TABLES.has(spec.key)) {
      rows.set(spec.key, []);
      continue;
    }
    if (!spec.table.companyId) {
      throw new Error(`Canonical table lacks tenant scope: ${spec.key}`);
    }
    rows.set(spec.key, await db.select().from(spec.table)
      .where(eq(spec.table.companyId, tenant.companyId)));
  }
  return rows;
}

export function canonicalDataToObject(data: CanonicalWorkbookData) {
  return Object.fromEntries(CANONICAL_TABLES.map(spec => [spec.key, data.get(spec.key) ?? []]));
}

export async function applyCanonicalData(
  tx: DbOrTx,
  rowsByTable: CanonicalWorkbookData,
  mode: ImportMode,
  options: ApplyCanonicalDataOptions = {},
): Promise<TransferStat[]> {
  const stats: TransferStat[] = [];
  const excludedTables = new Set([
    ...TENANT_EXCLUDED_TABLES,
    ...(options.excludedTables ?? []),
  ]);
  const tenant = transferTenant(options.scope);
  if (mode === "replace" && tenant.farmAccessMode !== "all") {
    throw new Error("Full replace restore requires access to all company farms");
  }
  if (!options.skipQuotaChecks) {
    await enforceAnimalImportLimit(tx, rowsByTable, mode, tenant);
  }
  const allowedFarmIds = tenant.accessibleFarmIds === "all"
    ? new Set((await tx.select({ id: farms.id }).from(farms).where(and(
        eq(farms.companyId, tenant.companyId),
      ))).map(row => row.id))
    : new Set(tenant.accessibleFarmIds);
  await normalizeBirthIntegrity(tx, rowsByTable, mode, tenant);

  if (mode === "replace") {
    for (const spec of [...CANONICAL_TABLES].reverse()) {
      if (excludedTables.has(spec.key)) continue;
      if (!spec.table.companyId) throw new Error(`Canonical table lacks tenant scope: ${spec.key}`);
      await tx.delete(spec.table).where(eq(spec.table.companyId, tenant.companyId));
    }
  }

  for (const spec of CANONICAL_TABLES) {
    if (excludedTables.has(spec.key)) continue;
    const importedRows = rowsByTable.get(spec.key) ?? [];
    const stat: TransferStat = { table: spec.key, applied: 0, skipped: 0 };

    if (mode === "replace") {
      for (const row of importedRows) {
        await tx.insert(spec.table).values(scopedImportedRow(spec.table, row, allowedFarmIds, tenant) as any);
        stat.applied++;
      }
      stats.push(stat);
      continue;
    }

    const columns = getCanonicalTableColumns(spec.table);
    const columnNames = Object.keys(columns);
    if (!spec.table.companyId) throw new Error(`Canonical table lacks tenant scope: ${spec.key}`);
    const existingRows = await tx.select().from(spec.table)
      .where(transferScope(tenant, spec.table)) as Record<string, unknown>[];
    const existingById = new Map(existingRows.map(row => [row.id, row]));
    const uniqueColumns = Object.entries(columns)
      .filter(([, column]) => column.isUnique)
      .map(([name]) => name);
    const existingByUnique = new Map(
      uniqueColumns.map(name => [
        name,
        new Map(
          existingRows
            .filter(row => row[name] !== null && row[name] !== undefined)
            .map(row => [String(row[name]), row]),
        ),
      ]),
    );

    for (const row of importedRows) {
      const sameId = existingById.get(row.id);
      if (sameId) {
        if (!rowsMatch(row, sameId, columnNames)) {
          throw new Error(
            `${spec.key}: ID ${String(row.id)} already exists with different data. Append aborted; use Replace to overwrite the system.`,
          );
        }
        stat.skipped++;
        continue;
      }

      for (const uniqueColumn of uniqueColumns) {
        const value = row[uniqueColumn];
        if (value === null || value === undefined) continue;
        const conflicting = existingByUnique.get(uniqueColumn)?.get(String(value));
        if (conflicting) {
          throw new Error(
            `${spec.key}: ${uniqueColumn}=${String(value)} already belongs to ID ${String(conflicting.id)}. Append aborted to protect relationships.`,
          );
        }
      }

      const scopedRow = scopedImportedRow(spec.table, row, allowedFarmIds, tenant);
      await tx.insert(spec.table).values(scopedRow as any);
      existingById.set(scopedRow.id, scopedRow);
      for (const uniqueColumn of uniqueColumns) {
        const value = row[uniqueColumn];
        if (value !== null && value !== undefined) {
          existingByUnique.get(uniqueColumn)?.set(String(value), scopedRow);
        }
      }
      stat.applied++;
    }
    stats.push(stat);
  }

  return stats;
}
