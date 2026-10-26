/**
 * Sample data for the public walkthrough (/demo). Every fixture is typed
 * against the real router outputs, so a server shape change fails `tsc`
 * here instead of crashing the demo at runtime.
 *
 * Dates are relative to the visitor's today so "due today" and "overdue"
 * always read correctly.
 */
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { CONFIGURABLE_ROLES, PERMISSION_PAGES } from "@shared/permissions";
import apisFavicon from "@/assets/brand/favicon.svg";

type Out = inferRouterOutputs<AppRouter>;
type Leaf<V> = V | ((input: any) => V);
type FlatFixtures = { [R in keyof Out]?: { [P in keyof Out[R]]?: Leaf<Out[R][P]> } };
// notifications.preferences is the only nested router the client reads.
export type DemoFixtures = Omit<FlatFixtures, "notifications"> & {
  notifications?: {
    list?: Leaf<Out["notifications"]["list"]>;
    preferences?: { get?: Leaf<Out["notifications"]["preferences"]["get"]> };
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const today = new Date();
today.setHours(12, 0, 0, 0);

/** YYYY-MM-DD, offset from today in days. */
function day(offset: number) {
  const date = new Date(today.getTime() + offset * DAY_MS);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function at(offset: number) {
  return new Date(today.getTime() + offset * DAY_MS);
}
function month(offset: number) {
  const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const COMPANY_ID = 1;
const FARM_ID = 1;
const OWNER_USER_ID = 1;
const audit = {
  companyId: COMPANY_ID,
  createdAt: at(-200),
  updatedAt: at(-2),
  createdBy: OWNER_USER_ID,
  deletedAt: null,
  deletedBy: null,
  version: 1,
};
const pid = (prefix: string, id: number) => `01DEMO${prefix.toUpperCase().padEnd(4, "X")}${String(id).padStart(16, "0")}`;

// ─── Reference data ─────────────────────────────────────────────────────────

const SPECIES = [
  { id: 1, name: "Sheep", gestationDays: 150 },
  { id: 2, name: "Goats", gestationDays: 150 },
  { id: 3, name: "Cattle", gestationDays: 283 },
];

const CATEGORIES = [
  { id: 1, name: "Ewes", speciesId: 1, idPrefix: "EW", targetWeightKg: "65", cycle: 365 },
  { id: 2, name: "Rams", speciesId: 1, idPrefix: "RM", targetWeightKg: "90", cycle: 365 },
  { id: 3, name: "Lambs", speciesId: 1, idPrefix: "LM", targetWeightKg: "35", cycle: 120 },
  { id: 4, name: "Fattening lambs", speciesId: 1, idPrefix: "FT", targetWeightKg: "50", cycle: 150 },
  { id: 5, name: "Does", speciesId: 2, idPrefix: "DO", targetWeightKg: "45", cycle: 365 },
  { id: 6, name: "Cows", speciesId: 3, idPrefix: "CW", targetWeightKg: "520", cycle: 365 },
];

const GROUPS = [
  { id: 1, groupCode: "PEN-A", name: "Pen A · Breeding ewes", speciesId: 1, categoryId: 1, color: "#256B4A" },
  { id: 2, groupCode: "PEN-B", name: "Pen B · Rams", speciesId: 1, categoryId: 2, color: "#315E83" },
  { id: 3, groupCode: "FAT-1", name: "Fattening yard", speciesId: 1, categoryId: 4, color: "#855B18" },
  { id: 4, groupCode: "GOAT", name: "Goat house", speciesId: 2, categoryId: 5, color: "#6D5187" },
  { id: 5, groupCode: "BARN", name: "Cattle barn", speciesId: 3, categoryId: 6, color: "#58675F" },
];

const STATUSES = [
  { id: 1, name: "Active", isExitStatus: false },
  { id: 2, name: "Pregnant", isExitStatus: false },
  { id: 3, name: "Lactating", isExitStatus: false },
  { id: 4, name: "Fattening", isExitStatus: false },
  { id: 5, name: "Sold", isExitStatus: true },
];

const OWNERS = [
  { id: 1, name: "APIS Farm", phone: "+20 100 000 0001", email: "farm@apiseg.com" },
  { id: 2, name: "Nile Partners", phone: "+20 100 000 0002", email: null },
];

const FEED_ITEMS = [
  { id: 1, name: "Alfalfa hay", unit: "kg", price: "9.50" },
  { id: 2, name: "Barley", unit: "kg", price: "14.00" },
  { id: 3, name: "Concentrate 16%", unit: "kg", price: "18.50" },
  { id: 4, name: "Mineral block", unit: "unit", price: "120.00" },
];

const VACCINES = [
  { id: 1, name: "Clostridial (8-in-1)", validityPeriod: 6, validityUnit: "months" as const, boosterRequired: true, boosterInterval: 30 },
  { id: 2, name: "FMD", validityPeriod: 6, validityUnit: "months" as const, boosterRequired: false, boosterInterval: null },
  { id: 3, name: "Sheep pox", validityPeriod: 12, validityUnit: "months" as const, boosterRequired: false, boosterInterval: null },
];

const EXPENSE_CATEGORIES = [
  { id: 1, name: "Veterinary" },
  { id: 2, name: "Labor" },
  { id: 3, name: "Utilities" },
  { id: 4, name: "Maintenance" },
];
const EXPENSE_SUBCATEGORIES = [
  { id: 1, categoryId: 1, name: "Medicine" },
  { id: 2, categoryId: 1, name: "Vet visit" },
  { id: 3, categoryId: 2, name: "Wages" },
  { id: 4, categoryId: 3, name: "Electricity" },
  { id: 5, categoryId: 3, name: "Water" },
  { id: 6, categoryId: 4, name: "Fencing" },
];

const BIRTH_TYPES = [
  { id: 1, name: "Single" },
  { id: 2, name: "Twins" },
  { id: 3, name: "Triplets" },
];

// ─── Animals ────────────────────────────────────────────────────────────────

type AnimalSeed = {
  id: number;
  code: string;
  categoryId: number;
  groupId: number;
  statusId: number;
  sex: "male" | "female";
  ownerId: number;
  ageDays: number;
  acquiredDaysAgo: number;
  acquisitionType: "purchased" | "born";
  purchaseCost: string | null;
  acquisitionWeight: string | null;
  latestWeight: string;
  damId?: number;
  sireId?: number;
  isActive?: boolean;
  nextVaccine?: [number, string];
  sale?: SoldLamb;
};

type SoldLamb = { daysAgo: number; price: string; paid: string; buyer: string };

const ANIMAL_SEEDS: AnimalSeed[] = [
  { id: 1, code: "EW-0142", categoryId: 1, groupId: 1, statusId: 2, sex: "female", ownerId: 1, ageDays: 1300, acquiredDaysAgo: 320, acquisitionType: "purchased", purchaseCost: "7800", acquisitionWeight: "48.0", latestWeight: "61.4", nextVaccine: [0, "Clostridial (8-in-1)"] },
  { id: 2, code: "EW-0118", categoryId: 1, groupId: 1, statusId: 3, sex: "female", ownerId: 1, ageDays: 1500, acquiredDaysAgo: 360, acquisitionType: "purchased", purchaseCost: "7200", acquisitionWeight: "46.5", latestWeight: "58.9", nextVaccine: [6, "FMD"] },
  { id: 3, code: "EW-0201", categoryId: 1, groupId: 1, statusId: 2, sex: "female", ownerId: 2, ageDays: 1100, acquiredDaysAgo: 280, acquisitionType: "purchased", purchaseCost: "8100", acquisitionWeight: "50.0", latestWeight: "63.2", nextVaccine: [-2, "Clostridial (8-in-1)"] },
  { id: 4, code: "EW-0155", categoryId: 1, groupId: 1, statusId: 1, sex: "female", ownerId: 1, ageDays: 980, acquiredDaysAgo: 240, acquisitionType: "purchased", purchaseCost: "7600", acquisitionWeight: "47.0", latestWeight: "59.7" },
  { id: 5, code: "RM-0027", categoryId: 2, groupId: 2, statusId: 1, sex: "male", ownerId: 1, ageDays: 1600, acquiredDaysAgo: 365, acquisitionType: "purchased", purchaseCost: "14500", acquisitionWeight: "72.0", latestWeight: "84.2", nextVaccine: [12, "Sheep pox"] },
  { id: 6, code: "RM-0031", categoryId: 2, groupId: 2, statusId: 1, sex: "male", ownerId: 2, ageDays: 1200, acquiredDaysAgo: 300, acquisitionType: "purchased", purchaseCost: "13800", acquisitionWeight: "70.5", latestWeight: "81.0" },
  { id: 7, code: "LM-0311", categoryId: 3, groupId: 1, statusId: 1, sex: "male", ownerId: 1, ageDays: 75, acquiredDaysAgo: 75, acquisitionType: "born", purchaseCost: null, acquisitionWeight: "4.2", latestWeight: "24.8", damId: 2, sireId: 5, nextVaccine: [3, "Clostridial (8-in-1)"] },
  { id: 8, code: "LM-0312", categoryId: 3, groupId: 1, statusId: 1, sex: "female", ownerId: 1, ageDays: 75, acquiredDaysAgo: 75, acquisitionType: "born", purchaseCost: null, acquisitionWeight: "3.9", latestWeight: "22.6", damId: 2, sireId: 5 },
  { id: 9, code: "LM-0320", categoryId: 3, groupId: 1, statusId: 1, sex: "female", ownerId: 2, ageDays: 40, acquiredDaysAgo: 40, acquisitionType: "born", purchaseCost: null, acquisitionWeight: "4.0", latestWeight: "14.1", damId: 4, sireId: 6 },
  { id: 10, code: "FT-0086", categoryId: 4, groupId: 3, statusId: 4, sex: "male", ownerId: 1, ageDays: 210, acquiredDaysAgo: 90, acquisitionType: "purchased", purchaseCost: "4200", acquisitionWeight: "28.0", latestWeight: "44.6" },
  { id: 11, code: "FT-0091", categoryId: 4, groupId: 3, statusId: 4, sex: "male", ownerId: 1, ageDays: 205, acquiredDaysAgo: 90, acquisitionType: "purchased", purchaseCost: "4100", acquisitionWeight: "27.5", latestWeight: "49.3" },
  { id: 12, code: "FT-0093", categoryId: 4, groupId: 3, statusId: 4, sex: "male", ownerId: 2, ageDays: 200, acquiredDaysAgo: 60, acquisitionType: "purchased", purchaseCost: "4350", acquisitionWeight: "30.0", latestWeight: "38.9" },
  { id: 13, code: "FT-0097", categoryId: 4, groupId: 3, statusId: 4, sex: "male", ownerId: 1, ageDays: 190, acquiredDaysAgo: 45, acquisitionType: "purchased", purchaseCost: "4000", acquisitionWeight: "29.0", latestWeight: "35.2" },
  { id: 14, code: "DO-0045", categoryId: 5, groupId: 4, statusId: 2, sex: "female", ownerId: 1, ageDays: 1000, acquiredDaysAgo: 260, acquisitionType: "purchased", purchaseCost: "6500", acquisitionWeight: "38.0", latestWeight: "43.5", nextVaccine: [1, "FMD"] },
  { id: 15, code: "DO-0052", categoryId: 5, groupId: 4, statusId: 1, sex: "female", ownerId: 1, ageDays: 850, acquiredDaysAgo: 220, acquisitionType: "purchased", purchaseCost: "6200", acquisitionWeight: "36.5", latestWeight: "41.0" },
  { id: 16, code: "CW-0008", categoryId: 6, groupId: 5, statusId: 2, sex: "female", ownerId: 1, ageDays: 1800, acquiredDaysAgo: 330, acquisitionType: "purchased", purchaseCost: "68000", acquisitionWeight: "430", latestWeight: "512", nextVaccine: [9, "FMD"] },
  { id: 17, code: "CW-0011", categoryId: 6, groupId: 5, statusId: 3, sex: "female", ownerId: 2, ageDays: 2100, acquiredDaysAgo: 360, acquisitionType: "purchased", purchaseCost: "72000", acquisitionWeight: "455", latestWeight: "538" },
  ...soldLambs(),
];

// Fattening lambs sold over the last month: the farm's main income. Each is
// bought at ~26 kg, finished to ~50 kg over about four months, and sold at a
// margin, so every closed animal shows a profit.
function soldLambs(): AnimalSeed[] {
  const rows: Array<[id: number, code: string, ownerId: number, soldDaysAgo: number, daysFattened: number, cost: string, inKg: string, outKg: string, price: string, paid: string, buyer: string]> = [
    [18, "FT-0074", 1, 12, 138, "3900", "27.0", "51.6", "7450", "7450", "Cairo Livestock Market"],
    [19, "FT-0079", 1, 12, 138, "3950", "26.5", "50.8", "7350", "4500", "Cairo Livestock Market"],
    [20, "FT-0058", 1, 27, 128, "3550", "26.0", "49.8", "7150", "7150", "Cairo Livestock Market"],
    [21, "FT-0061", 1, 27, 128, "3600", "26.5", "51.2", "7400", "7400", "Cairo Livestock Market"],
    [22, "FT-0062", 2, 27, 126, "3500", "25.5", "48.9", "7050", "7050", "Cairo Livestock Market"],
    [23, "FT-0064", 1, 21, 125, "3650", "27.0", "52.4", "7600", "7600", "Al Salam Butchery"],
    [24, "FT-0065", 1, 21, 125, "3580", "26.2", "50.1", "7250", "7250", "Al Salam Butchery"],
    [25, "FT-0067", 2, 21, 124, "3620", "26.8", "51.0", "7350", "7350", "Al Salam Butchery"],
    [26, "FT-0068", 1, 16, 130, "3540", "25.8", "49.5", "7150", "7150", "Giza Meat Traders"],
    [27, "FT-0070", 1, 16, 130, "3600", "26.4", "50.7", "7300", "7300", "Giza Meat Traders"],
    [28, "FT-0071", 1, 16, 128, "3560", "26.0", "50.2", "7250", "5000", "Giza Meat Traders"],
    [29, "FT-0072", 2, 12, 132, "3700", "27.4", "53.0", "7700", "7700", "Cairo Livestock Market"],
    [30, "FT-0081", 1, 5, 130, "3620", "26.6", "51.4", "7450", "7450", "Al Salam Butchery"],
    [31, "FT-0083", 2, 5, 130, "3580", "26.1", "50.3", "7300", "7300", "Al Salam Butchery"],
  ];
  return rows.map(([id, code, ownerId, soldDaysAgo, daysFattened, cost, inKg, outKg, price, paid, buyer]) => ({
    id,
    code,
    categoryId: 4,
    groupId: 3,
    statusId: 5,
    sex: "male",
    ownerId,
    ageDays: soldDaysAgo + daysFattened + 110,
    acquiredDaysAgo: soldDaysAgo + daysFattened,
    acquisitionType: "purchased",
    purchaseCost: cost,
    acquisitionWeight: inKg,
    latestWeight: outKg,
    isActive: false,
    sale: { daysAgo: soldDaysAgo, price, paid, buyer },
  }));
}

function fundingSource(seed: AnimalSeed) {
  if (!seed.purchaseCost) return null;
  // Breeding stock was bought with investment; fattening lambs are bought
  // back out of sales revenue.
  return seed.categoryId === 4 ? ("revenue" as const) : ("investment" as const);
}

const byId = <T extends { id: number }>(rows: T[], id: number | null | undefined) => rows.find(row => row.id === id);

function animalRecord(seed: AnimalSeed) {
  const category = byId(CATEGORIES, seed.categoryId)!;
  return {
    id: seed.id,
    publicId: pid("anim", seed.id),
    companyId: COMPANY_ID,
    farmId: FARM_ID,
    animalId: seed.code,
    speciesId: category.speciesId,
    categoryId: seed.categoryId,
    groupId: seed.groupId,
    statusId: seed.statusId,
    sex: seed.sex,
    acquisitionType: seed.acquisitionType,
    acquisitionDate: day(-seed.acquiredDaysAgo),
    birthDate: day(-seed.ageDays),
    damId: seed.damId ?? null,
    sireId: seed.sireId ?? null,
    ownerId: seed.ownerId,
    photoUrl: null,
    purchaseCost: seed.purchaseCost,
    purchaseFundingSource: fundingSource(seed),
    weightAtAcquisition: seed.acquisitionWeight,
    exitDate: seed.sale ? day(-seed.sale.daysAgo) : null,
    exitReason: seed.isActive === false ? "Sold" : null,
    notes: null,
    isActive: seed.isActive ?? true,
    createdAt: at(-seed.acquiredDaysAgo),
    updatedAt: at(-3),
    createdBy: OWNER_USER_ID,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    activeAnimalCode: seed.isActive === false ? null : seed.code,
  };
}

function animalRow(seed: AnimalSeed) {
  const category = byId(CATEGORIES, seed.categoryId)!;
  const group = byId(GROUPS, seed.groupId)!;
  const status = byId(STATUSES, seed.statusId)!;
  return {
    animal: animalRecord(seed),
    speciesName: byId(SPECIES, category.speciesId)!.name,
    categoryName: category.name,
    categoryReadyToSellThreshold: "95",
    categoryPrefix: category.idPrefix,
    targetWeightKg: category.targetWeightKg,
    groupCode: group.groupCode,
    groupName: group.name,
    statusName: status.name,
    isExitStatus: status.isExitStatus,
    ownerName: byId(OWNERS, seed.ownerId)!.name,
    latestWeightKg: seed.latestWeight,
    nextVaccineDate: seed.nextVaccine ? day(seed.nextVaccine[0]) : null,
    nextVaccineName: seed.nextVaccine ? seed.nextVaccine[1] : null,
    nextBoosterDate: null,
    nextBoosterName: null,
  };
}

const ANIMAL_ROWS = ANIMAL_SEEDS.map(animalRow);

function animalDetail(id: number) {
  const seed = byId(ANIMAL_SEEDS, id) ?? ANIMAL_SEEDS[0];
  const { categoryReadyToSellThreshold, latestWeightKg, ...row } = animalRow(seed);
  return {
    ...row,
    originBirthRecord: { id: seed.id, lambId: `LB-${String(seed.id).padStart(4, "0")}`, birthDate: day(-seed.ageDays) },
    readyToSellThreshold: categoryReadyToSellThreshold,
  };
}

// ─── Sales, expenses, feed, health ──────────────────────────────────────────

const SALES = ANIMAL_SEEDS.filter(seed => seed.sale)
  .sort((a, b) => b.sale!.daysAgo - a.sale!.daysAgo)
  .map((seed, index) => ({ id: index + 1, animalId: seed.id, weight: seed.latestWeight, ...seed.sale! }))
  .map(sale => {
  const seed = byId(ANIMAL_SEEDS, sale.animalId)!;
  return {
    sale: {
      id: sale.id,
      publicId: pid("sale", sale.id),
      companyId: COMPANY_ID,
      farmId: FARM_ID,
      animalId: sale.animalId,
      saleDate: day(-sale.daysAgo),
      salePrice: sale.price,
      amountPaid: sale.paid,
      weightAtSale: sale.weight,
      pricePerKg: (Number(sale.price) / Number(sale.weight)).toFixed(2),
      buyerName: sale.buyer,
      notes: null,
      createdAt: at(-sale.daysAgo),
      createdBy: OWNER_USER_ID,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    },
    animalCode: seed.code,
    speciesName: "Sheep",
    categoryName: "Fattening lambs",
    ownerName: byId(OWNERS, seed.ownerId)!.name,
    outstanding: (Number(sale.price) - Number(sale.paid)).toFixed(2),
  };
});

const EXPENSES = [
  { id: 1, daysAgo: 3, categoryId: 1, subCategoryId: 2, amount: "1200", targetType: "herd" as const, headId: null, vendor: "Dr. Samir Clinic", note: "Monthly herd check" },
  { id: 2, daysAgo: 5, categoryId: 1, subCategoryId: 1, amount: "340", targetType: "head" as const, headId: 3, vendor: "Delta Vet Supplies", note: "Hoof treatment" },
  { id: 3, daysAgo: 9, categoryId: 2, subCategoryId: 3, amount: "9500", targetType: "general" as const, headId: null, vendor: null, note: "Two farm workers" },
  { id: 4, daysAgo: 14, categoryId: 3, subCategoryId: 4, amount: "1850", targetType: "general" as const, headId: null, vendor: "Electricity company", note: null },
  { id: 5, daysAgo: 20, categoryId: 4, subCategoryId: 6, amount: "2600", targetType: "category" as const, headId: null, vendor: "Local workshop", note: "Fattening yard fence" },
  { id: 6, daysAgo: 33, categoryId: 3, subCategoryId: 5, amount: "620", targetType: "general" as const, headId: null, vendor: "Water authority", note: null },
].map(entry => {
  const head = entry.headId ? byId(ANIMAL_SEEDS, entry.headId) : undefined;
  return {
    expense: {
      ...audit,
      id: entry.id,
      publicId: pid("exp", entry.id),
      farmId: FARM_ID,
      scopeType: "farm" as const,
      expenseDate: day(-entry.daysAgo),
      categoryId: entry.categoryId,
      subCategoryId: entry.subCategoryId,
      amount: entry.amount,
      targetType: entry.targetType,
      categoryTarget: entry.targetType === "category" ? 4 : null,
      headId: entry.headId,
      vendorName: entry.vendor,
      notes: entry.note,
    },
    categoryName: byId(EXPENSE_CATEGORIES, entry.categoryId)!.name,
    subCategoryName: byId(EXPENSE_SUBCATEGORIES, entry.subCategoryId)!.name,
    animalCode: head?.code ?? null,
    animalOwnerId: head?.ownerId ?? null,
    ownerName: head ? byId(OWNERS, head.ownerId)!.name : null,
  };
});

const RATION_PLANS = [
  { id: 1, categoryId: 1, feedItemId: 1, qty: "1.800" },
  { id: 2, categoryId: 1, feedItemId: 2, qty: "0.400" },
  { id: 3, categoryId: 4, feedItemId: 3, qty: "1.100" },
  { id: 4, categoryId: 4, feedItemId: 1, qty: "0.900" },
  { id: 5, categoryId: 6, feedItemId: 1, qty: "9.000" },
  { id: 6, categoryId: 5, feedItemId: 1, qty: "1.500" },
].map(plan => {
  const item = byId(FEED_ITEMS, plan.feedItemId)!;
  return {
    id: plan.id,
    categoryId: plan.categoryId,
    feedItemId: plan.feedItemId,
    qtyPerHeadPerDay: plan.qty,
    effectiveDate: day(-120),
    endDate: null,
    isActive: true,
    version: 1,
    createdAt: at(-120),
    feedItemName: item.name,
    unit: item.unit,
    categoryName: byId(CATEGORIES, plan.categoryId)!.name,
    currentPrice: item.price,
  };
});

const STOCK_LEDGER = [
  { id: 1, feedItemId: 1, daysAgo: 30, type: "purchase" as const, qty: "2000", unitCost: "9.50", supplier: "Fayoum Hay Co." },
  { id: 2, feedItemId: 2, daysAgo: 28, type: "purchase" as const, qty: "1000", unitCost: "14.00", supplier: "Delta Grains" },
  { id: 3, feedItemId: 3, daysAgo: 21, type: "purchase" as const, qty: "600", unitCost: "18.50", supplier: "Delta Grains" },
  { id: 4, feedItemId: 1, daysAgo: 7, type: "stock_count" as const, qty: "1260", unitCost: null, supplier: null },
  { id: 5, feedItemId: 2, daysAgo: 7, type: "stock_count" as const, qty: "690", unitCost: null, supplier: null },
  { id: 6, feedItemId: 3, daysAgo: 7, type: "stock_count" as const, qty: "120", unitCost: null, supplier: null },
].map(entry => {
  const item = byId(FEED_ITEMS, entry.feedItemId)!;
  return {
    id: entry.id,
    feedItemId: entry.feedItemId,
    transactionDate: day(-entry.daysAgo),
    transactionType: entry.type,
    qty: entry.qty,
    unitCost: entry.unitCost,
    totalCost: entry.unitCost ? (Number(entry.qty) * Number(entry.unitCost)).toFixed(2) : null,
    supplierName: entry.supplier,
    notes: null,
    version: 1,
    feedItemName: item.name,
    feedItemUnit: item.unit,
  };
});

const STOCK_STATUS = [
  { feedItemId: 1, onHand: 1062, daily: 28.4, status: "ok" },
  { feedItemId: 2, onHand: 662, daily: 4.0, status: "ok" },
  { feedItemId: 3, onHand: 89, daily: 4.4, status: "low" },
].map(entry => {
  const item = byId(FEED_ITEMS, entry.feedItemId)!;
  const daysRemaining = Math.floor(entry.onHand / entry.daily);
  return {
    feedItemId: entry.feedItemId,
    feedItemName: item.name,
    unit: item.unit,
    stockOnHand: entry.onHand,
    consumedSinceCount: Math.round(entry.daily * 7),
    daysSinceCount: 7,
    lastCountDate: day(-7),
    dailyConsumption: entry.daily,
    consumptionByCategory: [{ categoryDailyKg: entry.daily, heads: 8, categoryId: 1 }],
    daysRemaining,
    runOutDate: day(daysRemaining),
    status: entry.status,
  };
});

const VACCINATION_RECORDS = [
  { id: 1, animalId: 1, vaccineId: 1, daysAgo: 180, next: 0 },
  { id: 2, animalId: 3, vaccineId: 1, daysAgo: 182, next: -2 },
  { id: 3, animalId: 2, vaccineId: 2, daysAgo: 174, next: 6 },
  { id: 4, animalId: 14, vaccineId: 2, daysAgo: 179, next: 1 },
  { id: 5, animalId: 7, vaccineId: 1, daysAgo: 27, next: 3 },
  { id: 6, animalId: 5, vaccineId: 3, daysAgo: 353, next: 12 },
  { id: 7, animalId: 16, vaccineId: 2, daysAgo: 171, next: 9 },
].map(entry => {
  const vaccine = byId(VACCINES, entry.vaccineId)!;
  return {
    id: entry.id,
    animalId: entry.animalId,
    animalIdStr: byId(ANIMAL_SEEDS, entry.animalId)!.code,
    vaccineId: entry.vaccineId,
    vaccineName: vaccine.name,
    vaccinationDate: day(-entry.daysAgo),
    nextDueDate: day(entry.next),
    boosterDueDate: null,
    notifyBeforeNext: 3,
    notifyBeforeBooster: null,
    batchNumber: `B-${2600 + entry.id}`,
    notes: null,
    veterinarian: "Dr. Samir",
    isCompleted: false,
    createdAt: at(-entry.daysAgo),
    version: 1,
  };
});

const PREGNANCIES = [
  { id: 1, animalId: 1, sireId: 5, confirmedDaysAgo: 95, gestation: 150 },
  { id: 2, animalId: 3, sireId: 6, confirmedDaysAgo: 138, gestation: 150 },
  { id: 3, animalId: 14, sireId: null, confirmedDaysAgo: 60, gestation: 150 },
  { id: 4, animalId: 16, sireId: null, confirmedDaysAgo: 200, gestation: 283 },
].map(entry => {
  const seed = byId(ANIMAL_SEEDS, entry.animalId)!;
  const daysPregnant = entry.confirmedDaysAgo + 30;
  const daysRemaining = entry.gestation - daysPregnant;
  return {
    daysPregnant,
    daysRemaining,
    progressPct: Math.round((daysPregnant / entry.gestation) * 100),
    displayStatus: daysRemaining < 0 ? "overdue" : daysRemaining <= 7 ? "due" : "active",
    record: {
      ...audit,
      id: entry.id,
      publicId: pid("preg", entry.id),
      farmId: FARM_ID,
      animalId: entry.animalId,
      sireId: entry.sireId,
      confirmationDate: day(-entry.confirmedDaysAgo),
      gestationDays: entry.gestation,
      expectedDueDate: day(daysRemaining),
      notifyBeforeDue: 7,
      checkupDate: day(Math.min(daysRemaining - 3, 10)),
      notifyBeforeCheckup: 2,
      status: "active" as const,
      outcomeLambingLogId: null,
      completedDate: null,
      notes: null,
      activeAnimalGuard: entry.animalId,
    },
    animalCode: seed.code,
    speciesName: byId(SPECIES, byId(CATEGORIES, seed.categoryId)!.speciesId)!.name,
    ownerId: seed.ownerId,
    ownerName: byId(OWNERS, seed.ownerId)!.name,
  };
});

const LAMBING_LOG = [
  { id: 1, lambId: "LB-0311", daysAgo: 75, damId: 2, sireId: 5, sex: "male", birthTypeId: 2, weight: "4.2", promotedHeadId: 7 },
  { id: 2, lambId: "LB-0312", daysAgo: 75, damId: 2, sireId: 5, sex: "female", birthTypeId: 2, weight: "3.9", promotedHeadId: 8 },
  { id: 3, lambId: "LB-0320", daysAgo: 40, damId: 4, sireId: 6, sex: "female", birthTypeId: 1, weight: "4.0", promotedHeadId: 9 },
  { id: 4, lambId: "LB-0327", daysAgo: 6, damId: 15, sireId: null, sex: "male", birthTypeId: 1, weight: "3.1", promotedHeadId: null },
].map(entry => ({
  id: entry.id,
  lambId: entry.lambId,
  speciesId: entry.damId === 15 ? 2 : 1,
  categoryId: entry.damId === 15 ? 5 : 3,
  birthDate: day(-entry.daysAgo),
  damId: entry.damId,
  sireId: entry.sireId,
  sex: entry.sex,
  birthTypeId: entry.birthTypeId,
  birthWeightKg: entry.weight,
  valueUsed: null,
  groupId: entry.damId === 15 ? 4 : 1,
  notes: null,
  isPromoted: entry.promotedHeadId !== null,
  promotedHeadId: entry.promotedHeadId,
  promotedAnimalCode: entry.promotedHeadId ? byId(ANIMAL_SEEDS, entry.promotedHeadId)!.code : null,
  promotedAnimalDeletedAt: null,
  promotedAnimalPurgedAt: null,
  createdAt: at(-entry.daysAgo),
  version: 1,
  birthTypeName: byId(BIRTH_TYPES, entry.birthTypeId)!.name,
  groupCode: entry.damId === 15 ? "GOAT" : "PEN-A",
  speciesName: entry.damId === 15 ? "Goats" : "Sheep",
  categoryName: entry.damId === 15 ? "Does" : "Lambs",
  effectiveDamId: entry.damId,
  effectiveSireId: entry.sireId,
  damAnimalId: byId(ANIMAL_SEEDS, entry.damId)?.code ?? null,
  sireAnimalId: byId(ANIMAL_SEEDS, entry.sireId)?.code ?? null,
}));

const NOTIFICATIONS = [
  { id: 1, type: "vaccination", title: "Vaccination due today", message: "EW-0142 is due for Clostridial (8-in-1) today.", priority: "high" as const, hoursAgo: 2, read: false },
  { id: 2, type: "vaccination", title: "Vaccination overdue", message: "EW-0201 missed its Clostridial (8-in-1) booster 2 days ago.", priority: "critical" as const, hoursAgo: 30, read: false },
  { id: 3, type: "feed_stock", title: "Feed stock running low", message: "Concentrate 16% has about 20 days left at current use.", priority: "medium" as const, hoursAgo: 20, read: false },
  { id: 4, type: "pregnancy", title: "Birth expected soon", message: "EW-0201 is expected to give birth within 2 weeks.", priority: "medium" as const, hoursAgo: 48, read: true },
  { id: 5, type: "growth", title: "Ready to sell", message: "FT-0091 reached 49.3 kg, close to its 50 kg target.", priority: "low" as const, hoursAgo: 72, read: true },
].map(entry => ({
  isRead: entry.read,
  id: entry.id,
  publicId: pid("ntf", entry.id),
  companyId: COMPANY_ID,
  farmId: FARM_ID,
  userId: OWNER_USER_ID,
  alertType: entry.type,
  title: entry.title,
  message: entry.message,
  relatedEntityType: null,
  relatedEntityId: null,
  priority: entry.priority,
  createdAt: new Date(Date.now() - entry.hoursAgo * 3_600_000),
  expiresAt: null,
  deduplicationKey: null,
  version: 1,
}));

const USERS = [
  { id: 1, name: "Demo Owner", email: "owner@apiseg.com", role: "owner" as const, protectedOwner: true },
  { id: 2, name: "Mona Adel", email: "mona@apiseg.com", role: "supervisor" as const, protectedOwner: false },
  { id: 3, name: "Karim Fathy", email: "karim@apiseg.com", role: "staff" as const, protectedOwner: false },
  { id: 4, name: "Youssef Nabil", email: "youssef@apiseg.com", role: "viewer" as const, protectedOwner: false },
];

function userRecord(user: (typeof USERS)[number]) {
  return {
    id: user.id,
    publicId: pid("user", user.id),
    openId: `demo-${user.id}`,
    name: user.name,
    email: user.email,
    normalizedEmail: user.email,
    loginMethod: "password",
    role: user.role,
    status: "active" as const,
    authVersion: 1,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastPasswordChange: at(-60),
    version: 1,
    createdAt: at(-300),
    updatedAt: at(-2),
    lastSignedIn: at(-user.id),
  };
}

const OWNER_MATRIX = PERMISSION_PAGES.map(page => ({
  page: page.id,
  path: page.path,
  actions: page.actions.map(action => ({ action, allowed: true })),
}));

// ─── P&L ───────────────────────────────────────────────────────────────────

function animalPnL(seed: AnimalSeed) {
  const category = byId(CATEGORIES, seed.categoryId)!;
  const daysOnFarm = seed.acquiredDaysAgo - (seed.sale?.daysAgo ?? 0);
  const purchaseCost = Number(seed.purchaseCost ?? 0);
  const feedCost = Math.round(daysOnFarm * (category.speciesId === 3 ? 55 : category.id === 4 ? 12 : 10));
  const direct = seed.id === 3 ? 340 : 0;
  const categoryAlloc = category.id === 4 ? 250 : 0;
  const herdAlloc = 40;
  const generalAlloc = 180;
  const totalCost = purchaseCost + feedCost + direct + categoryAlloc + herdAlloc + generalAlloc;
  const sale = SALES.find(row => row.sale.animalId === seed.id);
  const revenue = sale ? Number(sale.sale.salePrice) : 0;
  return {
    animalId: seed.id,
    daysOnFarm,
    purchaseCost,
    purchaseFundingSource: fundingSource(seed),
    animalOperatingCost: feedCost + direct,
    feedCost,
    directExpenseTotal: direct,
    categoryExpenseAllocation: categoryAlloc,
    herdExpenseAllocation: herdAlloc,
    generalExpenseAllocation: generalAlloc,
    totalCost,
    revenue,
    netPnL: revenue - totalCost,
    costPerDay: Math.round((totalCost / Math.max(daysOnFarm, 1)) * 100) / 100,
    costPerMonth: Math.round((totalCost / Math.max(daysOnFarm, 1)) * 30),
    feedCostPerMonth: Math.round((feedCost / Math.max(daysOnFarm, 1)) * 30),
    pricePerKg: sale ? Number(sale.sale.pricePerKg) : 0,
  };
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const totalRevenue = SALES.reduce((sum, row) => sum + Number(row.sale.salePrice), 0);
const cashReceived = SALES.reduce((sum, row) => sum + Number(row.sale.amountPaid), 0);
const otherExpenses = EXPENSES.reduce((sum, row) => sum + Number(row.expense.amount), 0);
const feedExpenses = STOCK_LEDGER.reduce((sum, row) => sum + Number(row.totalCost ?? 0), 0);
const animalPurchases = ANIMAL_SEEDS.filter(seed => seed.acquiredDaysAgo <= 30)
  .reduce((sum, seed) => sum + Number(seed.purchaseCost ?? 0), 0);
const periodCosts = animalPurchases + feedExpenses + otherExpenses;
const activeRows = ANIMAL_ROWS.filter(row => row.animal.isActive);
const headCountByCategory = CATEGORIES.map(category => ({
  categoryId: category.id,
  categoryName: category.name,
  headCount: activeRows.filter(row => row.animal.categoryId === category.id).length,
})).filter(row => row.headCount > 0);

const setting = (id: number, settingKey: string, settingValue: string, description: string) => ({
  id,
  publicId: pid("set", id),
  companyId: COMPANY_ID,
  settingKey,
  settingValue,
  description,
  updatedAt: at(-30),
  updatedBy: OWNER_USER_ID,
  version: 1,
});

export const DEMO_COMPANY_NAME = "APIS";

export const demoFixtures: DemoFixtures = {
  auth: {
    me: userRecord(USERS[0]),
    suspensionStatus: { suspended: false },
    invitationIdentity: null,
    tenantContext: {
      company: {
        publicId: pid("comp", 1),
        name: DEMO_COMPANY_NAME,
        slug: "demo",
        lifecycleStatus: "active",
        brandingVersion: 1,
        logoUrl: apisFavicon,
      },
      membership: { role: "owner", farmAccessMode: "all" },
      selectedFarmPublicId: pid("farm", 1),
      farms: [{ publicId: pid("farm", 1), name: "APIS Demo Farm", code: "DEMO", timezone: "Africa/Cairo" }],
    },
  },
  tenancy: {
    publicBranding: { name: DEMO_COMPANY_NAME, hasLogo: false, hasFavicon: false },
  },
  permissions: {
    my: { role: "owner", matrix: OWNER_MATRIX },
    catalog: { configurableRoles: CONFIGURABLE_ROLES, pages: PERMISSION_PAGES },
    roleMatrix: (input: { role: "supervisor" | "staff" | "user" | "viewer" }) => ({
      role: input.role,
      revision: "demo",
      matrix: PERMISSION_PAGES.map(page => ({
        page: page.id,
        path: page.path,
        actions: page.actions.map(action => ({
          action,
          allowed: action === "view" || (input.role !== "viewer" && (action === "create" || action === "update")),
        })),
      })),
    }),
  },
  preferences: {
    get: { user: {}, globals: {}, role: "owner" },
  },
  notifications: {
    list: (input?: { unreadOnly?: boolean }) =>
      input?.unreadOnly ? NOTIFICATIONS.filter(row => !row.isRead) : NOTIFICATIONS,
    preferences: {
      get: {
        pregnancy: { inApp: true, email: true },
        feed_stock: { inApp: true, email: false },
        vaccination: { inApp: true, email: true },
        growth: { inApp: true, email: false },
      },
    },
  },
  dashboard: {
    getKPIs: {
      totalActiveHeads: activeRows.length,
      averageHeads: activeRows.length,
      otherExpenses,
      feedExpenses,
      totalExpenses: otherExpenses + feedExpenses,
      totalRevenue,
      cashReceived,
      outstandingReceivables: totalRevenue - cashReceived,
      grossPnL: totalRevenue - otherExpenses - feedExpenses,
      costPerHeadPerDay: Math.round(((otherExpenses + feedExpenses) / activeRows.length / 30) * 100) / 100,
      categoryBreakdown: headCountByCategory,
      ownerId: null,
      period: { fromDate: day(-30), toDate: day(0) },
    },
    getHeadCountByCategory: headCountByCategory.map(row => ({ category: row.categoryName, count: row.headCount })),
    getSalesTrend: [-5, -4, -3, -2, -1, 0].map((offset, i) => ({
      month: month(offset),
      revenue: [58400, 52900, 71600, 66300, 79800, totalRevenue][i],
      count: [8, 7, 10, 9, 11, SALES.length][i],
    })),
    getExpenseTrend: [-5, -4, -3, -2, -1, 0].map((offset, i) => ({
      month: month(offset),
      total: [38200, 36900, 41300, 39800, 42600, otherExpenses + feedExpenses][i],
    })),
    getIncomeStatement: (input: { fromDate: string; toDate: string }) => ({
      period: { fromDate: input.fromDate, toDate: input.toDate },
      ownerId: null,
      revenue: { animalSales: totalRevenue, total: totalRevenue, cashReceived, outstandingReceivables: totalRevenue - cashReceived },
      costs: {
        animalPurchases,
        feedPurchases: feedExpenses,
        byCategory: EXPENSE_CATEGORIES.map(category => ({
          categoryName: category.name,
          total: EXPENSES.filter(row => row.expense.categoryId === category.id).reduce((sum, row) => sum + Number(row.expense.amount), 0),
        })),
        totalOther: otherExpenses,
        total: periodCosts,
      },
      runningCostPerMonth: {
        farmWide: 11970,
        animalWide: 14100,
        total: 26070,
        periodFarmWide: 11970,
        periodAnimalWide: 14100,
        periodTotal: 26070,
        monthsInPeriod: 1,
      },
      grossProfit: totalRevenue - periodCosts,
      profitMargin: Math.round(((totalRevenue - periodCosts) / totalRevenue) * 1000) / 10,
    }),
  },
  animals: {
    list: (input?: { isActive?: boolean; categoryId?: number; speciesId?: number; statusId?: number; groupId?: number; ownerId?: number }) =>
      ANIMAL_ROWS.filter(row =>
        (input?.isActive === undefined || row.animal.isActive === input.isActive) &&
        (!input?.categoryId || row.animal.categoryId === input.categoryId) &&
        (!input?.speciesId || row.animal.speciesId === input.speciesId) &&
        (!input?.statusId || row.animal.statusId === input.statusId) &&
        (!input?.groupId || row.animal.groupId === input.groupId) &&
        (!input?.ownerId || row.animal.ownerId === input.ownerId),
      ),
    lookup: (input?: { sex?: "male" | "female"; speciesId?: number }) =>
      ANIMAL_ROWS.filter(row =>
        row.animal.isActive &&
        (!input?.sex || row.animal.sex === input.sex) &&
        (!input?.speciesId || row.animal.speciesId === input.speciesId),
      ).map(row => ({ animal: { id: row.animal.id, animalId: row.animal.animalId, sex: row.animal.sex, version: 1 } })),
    listFattening: ANIMAL_ROWS.filter(row => row.animal.categoryId === 4 && row.animal.isActive).map(row => ({
      animal: {
        id: row.animal.id,
        animalId: row.animal.animalId,
        acquisitionDate: row.animal.acquisitionDate,
        weightAtAcquisition: row.animal.weightAtAcquisition,
      },
      categoryName: row.categoryName,
      groupName: row.groupName,
      statusName: row.statusName,
      latestWeightKg: row.latestWeightKg,
      targetWeightKg: row.targetWeightKg,
    })),
    getById: (input: { id: number }) => animalDetail(input.id),
    getPhotoUrl: { url: null },
    getLineage: (input: { animalId: number }) => {
      const seed = byId(ANIMAL_SEEDS, input.animalId) ?? ANIMAL_SEEDS[0];
      return {
        animal: animalDetail(seed.id),
        dam: seed.damId ? animalDetail(seed.damId) : null,
        sire: seed.sireId ? animalDetail(seed.sireId) : null,
        damDam: null,
        damSire: null,
        sireDam: null,
        sireSire: null,
        offspring: ANIMAL_ROWS.filter(row => row.animal.damId === seed.id || row.animal.sireId === seed.id),
      };
    },
    getWeightLog: (input: { animalId: number }) => {
      const seed = byId(ANIMAL_SEEDS, input.animalId) ?? ANIMAL_SEEDS[0];
      const start = Number(seed.acquisitionWeight ?? seed.latestWeight);
      const end = Number(seed.latestWeight);
      return [0, 1, 2, 3, 4].map(step => ({
        id: input.animalId * 10 + step,
        publicId: pid("wgt", input.animalId * 10 + step),
        companyId: COMPANY_ID,
        farmId: FARM_ID,
        animalId: input.animalId,
        weighDate: day(-Math.round(seed.acquiredDaysAgo * (1 - step / 4))),
        weightKg: (start + ((end - start) * step) / 4).toFixed(1),
        sessionId: null,
        notes: null,
        createdAt: at(-Math.round(seed.acquiredDaysAgo * (1 - step / 4))),
        createdBy: OWNER_USER_ID,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      }));
    },
    getStatusHistory: (input: { animalId: number }) => {
      const seed = byId(ANIMAL_SEEDS, input.animalId) ?? ANIMAL_SEEDS[0];
      return seed.statusId === 1 ? [] : [{
        id: input.animalId,
        animalId: input.animalId,
        previousStatusId: 1,
        newStatusId: seed.statusId,
        changedAt: at(-20),
        changedBy: OWNER_USER_ID,
        notes: null,
      }];
    },
    getFeedHistory: (input: { animalId: number }) => {
      const seed = byId(ANIMAL_SEEDS, input.animalId) ?? ANIMAL_SEEDS[0];
      return RATION_PLANS.filter(plan => plan.categoryId === seed.categoryId);
    },
    getExpenseHistory: (input: { animalId: number }) => EXPENSES.filter(row => row.expense.headId === input.animalId),
    getAnimalSales: (input: { animalId: number }) => SALES.filter(row => row.sale.animalId === input.animalId),
    getPnL: (input: { animalId: number }) => {
      const seed = byId(ANIMAL_SEEDS, input.animalId) ?? ANIMAL_SEEDS[0];
      const sale = SALES.find(row => row.sale.animalId === seed.id);
      return {
        ...animalPnL(seed),
        expenseBreakdown: [
          { amount: 180, categoryName: "Labor", subCategoryName: "Wages", targetType: "general" as const },
          { amount: 40, categoryName: "Veterinary", subCategoryName: "Vet visit", targetType: "herd" as const },
        ],
        projectedCost: seed.isActive === false ? null : animalPnL(seed).totalCost + 900,
        isActive: seed.isActive ?? true,
        saleRecord: sale?.sale ?? SALES[0].sale,
      };
    },
    getAllPnL: ANIMAL_SEEDS.map(seed => {
      const row = animalRow(seed);
      return {
        ...animalPnL(seed),
        animalCode: seed.code,
        categoryName: row.categoryName,
        speciesName: row.speciesName,
        ownerName: row.ownerName,
        isActive: row.animal.isActive,
        statusName: row.statusName,
      };
    }),
  },
  breeding: {
    listLambing: (input?: { isPromoted?: boolean }) =>
      LAMBING_LOG.filter(row => input?.isPromoted === undefined || row.isPromoted === input.isPromoted),
    summary: { total: LAMBING_LOG.length, pending: LAMBING_LOG.filter(row => !row.isPromoted).length, promoted: LAMBING_LOG.filter(row => row.isPromoted).length },
  },
  pregnancy: {
    list: (input?: { status?: string; animalId?: number }) =>
      PREGNANCIES.filter(row => (!input?.status || row.record.status === input.status) && (!input?.animalId || row.record.animalId === input.animalId)),
    byAnimal: (input: { animalId: number }) => PREGNANCIES.filter(row => row.record.animalId === input.animalId),
    summary: {
      active: PREGNANCIES.length,
      dueSoon: PREGNANCIES.filter(row => row.displayStatus === "due").length,
      overdue: PREGNANCIES.filter(row => row.displayStatus === "overdue").length,
      delivered: 3,
    },
    getUpcoming: {
      due: PREGNANCIES.filter(row => row.daysRemaining <= 30).map(row => ({
        id: row.record.id,
        animalId: row.record.animalId,
        animalIdStr: row.animalCode,
        expectedDueDate: row.record.expectedDueDate,
        notifyBeforeDue: 7,
      })),
      checkups: PREGNANCIES.map(row => ({
        id: row.record.id,
        animalId: row.record.animalId,
        animalIdStr: row.animalCode,
        checkupDate: row.record.checkupDate,
        notifyBeforeCheckup: 2,
      })),
    },
    reproductiveHistory: (input: { animalId: number }) => ({
      totalPregnancies: input.animalId === 2 ? 3 : 1,
      delivered: input.animalId === 2 ? 3 : 0,
      aborted: 0,
      lost: 0,
      active: PREGNANCIES.some(row => row.record.animalId === input.animalId) ? 1 : 0,
      lastDeliveryDate: input.animalId === 2 ? day(-75) : null,
    }),
  },
  feed: {
    getRationPlans: (input?: { categoryId?: number }) =>
      RATION_PLANS.filter(plan => !input?.categoryId || plan.categoryId === input.categoryId),
    getStockLedger: (input?: { feedItemId?: number }) =>
      STOCK_LEDGER.filter(entry => !input?.feedItemId || entry.feedItemId === input.feedItemId),
    getStockStatus: STOCK_STATUS,
    getShrinkage: {
      rows: [
        { feedItemId: 1, feedItemName: "Alfalfa hay", unit: "kg", fromDate: day(-37), toDate: day(-7), expectedQty: 1320, actualQty: 1260, shrinkageQty: 60, shrinkageValue: 570 },
      ],
      byItemLatest: { 1: { shrinkageQty: 60, shrinkageValue: 570, toDate: day(-7) } },
      byMonth: [{ month: month(0), shrinkageQty: 60, shrinkageValue: 570 }],
    },
  },
  vaccination: {
    getVaccinationRecords: (input?: { animalId?: number }) =>
      VACCINATION_RECORDS.filter(row => !input?.animalId || row.animalId === input.animalId),
    getUpcomingVaccinations: VACCINATION_RECORDS.filter(row => row.nextDueDate! <= day(14)).map(row => ({
      id: row.id,
      animalId: row.animalId,
      animalIdStr: row.animalIdStr,
      vaccineName: row.vaccineName,
      nextDueDate: row.nextDueDate,
      boosterDueDate: null,
      notifyBeforeNext: 3,
      notifyBeforeBooster: null,
      isCompleted: false,
    })),
  },
  expenses: {
    list: (input?: { categoryId?: number; headId?: number }) =>
      EXPENSES.filter(row => (!input?.categoryId || row.expense.categoryId === input.categoryId) && (!input?.headId || row.expense.headId === input.headId)),
  },
  sales: {
    list: (input?: { animalId?: number; outstandingOnly?: boolean }) =>
      SALES.filter(row => (!input?.animalId || row.sale.animalId === input.animalId) && (!input?.outstandingOnly || Number(row.outstanding) > 0)),
  },
  capital: {
    getSummary: null,
    previewMonthlyAllocation: null,
  },
  audit: {
    list: [
      { id: 3, action: "update", entityType: "animal", entityId: "EW-0142", userId: 2, createdAt: at(-0.1), message: "Status changed from Active to Pregnant", oldValues: { status: "Active" }, newValues: { status: "Pregnant" }, ipAddress: null, notes: null, revertable: true, revertedAt: null, target: "EW-0142" },
      { id: 2, action: "create", entityType: "sale", entityId: String(SALES.find(row => row.animalCode === "FT-0079")!.sale.id), userId: 1, createdAt: at(-12), message: "Sale recorded for FT-0079", oldValues: null, newValues: { salePrice: "7350" }, ipAddress: null, notes: null, revertable: false, revertedAt: null, target: "FT-0079" },
      { id: 1, action: "create", entityType: "vaccination", entityId: "5", userId: 3, createdAt: at(-27), message: "Vaccination recorded for LM-0311", oldValues: null, newValues: { vaccine: "Clostridial (8-in-1)" }, ipAddress: null, notes: null, revertable: false, revertedAt: null, target: "LM-0311" },
    ],
  },
  recycleBin: {
    list: [
      { entityType: "expense", id: 99, version: 2, label: "Fuel · EGP 450.00", deletedAt: at(-4), deletedBy: 2, meta: {} },
    ],
  },
  userMgmt: {
    listUsers: USERS.map(user => ({ ...userRecord(user), isProtectedOwner: user.protectedOwner })),
  },
  config: {
    getSpecies: SPECIES.map(row => ({ ...audit, ...row, publicId: pid("spc", row.id), description: null, isActive: true, activeName: row.name })),
    getCategories: (input?: { speciesId?: number }) =>
      CATEGORIES.filter(row => !input?.speciesId || row.speciesId === input.speciesId).map(row => ({
        id: row.id,
        name: row.name,
        speciesId: row.speciesId,
        speciesName: byId(SPECIES, row.speciesId)!.name,
        idPrefix: row.idPrefix,
        idSequence: 100 + row.id,
        lambIdSequence: 330,
        targetWeightKg: row.targetWeightKg,
        expectedCycleDays: row.cycle,
        autoStageWeightKg: row.id === 3 ? "30" : null,
        autoStageTargetCategoryId: row.id === 3 ? 4 : null,
        version: 1,
        isExitStatus: false,
        isActive: true,
        createdAt: at(-300),
      })),
    getGroups: (input?: { speciesId?: number }) =>
      GROUPS.filter(row => !input?.speciesId || row.speciesId === input.speciesId).map(row => ({
        ...audit,
        ...row,
        publicId: pid("grp", row.id),
        farmId: FARM_ID,
        description: null,
        latitude: null,
        longitude: null,
        mapShape: null,
        isActive: true,
        activeCode: row.groupCode,
      })),
    getStatuses: STATUSES.map(row => ({ ...audit, ...row, publicId: pid("sts", row.id), description: null, isActive: true, activeName: row.name })),
    getOwners: OWNERS.map(row => ({ ...audit, ...row, publicId: pid("own", row.id), notes: null, isActive: true })),
    getOwnerOptions: OWNERS.map(row => ({ id: row.id, name: row.name, isActive: true })),
    getFeedItems: FEED_ITEMS.map(row => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      isActive: true,
      createdAt: at(-300),
      updatedAt: at(-30),
      createdBy: OWNER_USER_ID,
      deletedAt: null,
      deletedBy: null,
      version: 1,
      currentPrice: row.price,
    })),
    getAllFeedItemPrices: FEED_ITEMS.map(row => ({
      id: row.id,
      feedItemId: row.id,
      feedItemName: row.name,
      unit: row.unit,
      pricePerUnit: row.price,
      effectiveDate: day(-60),
      notes: null,
      createdAt: at(-60),
      version: 1,
    })),
    getVaccines: VACCINES.map(row => ({ ...audit, ...row, publicId: pid("vac", row.id), description: null, isActive: true, activeName: row.name })),
    getExpenseCategories: EXPENSE_CATEGORIES.map(row => ({ ...audit, ...row, publicId: pid("exc", row.id), description: null, isActive: true, activeName: row.name })),
    getExpenseSubCategories: (input?: { categoryId?: number }) =>
      EXPENSE_SUBCATEGORIES.filter(row => !input?.categoryId || row.categoryId === input.categoryId).map(row => ({
        ...audit,
        ...row,
        publicId: pid("exs", row.id),
        description: null,
        isActive: true,
        activeName: row.name,
      })),
    getBirthTypes: BIRTH_TYPES.map(row => ({ ...audit, ...row, publicId: pid("bty", row.id), description: null, isActive: true, activeName: row.name })),
    getSettings: [
      setting(1, "currency", "EGP", "Display currency"),
      setting(2, "default_gestation_days", "150", "Default gestation for small ruminants"),
    ],
    getDisplaySettings: [setting(3, "date_format", "DD/MM/YYYY", "Date display format")],
    getCompanyBranding: {
      companyPublicId: pid("comp", 1),
      name: DEMO_COMPANY_NAME,
      slug: "demo",
      version: 1,
      logoUrl: null,
      hasFavicon: false,
    },
    getFarmMapImage: { key: null, url: null },
  },
};
