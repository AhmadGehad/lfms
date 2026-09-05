import { beforeEach, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { animalsRouter } from "./routers/animals";
import * as db from "./db";

vi.mock("./entitlements/sqlStore", async importOriginal => {
  const actual = await importOriginal<typeof import("./entitlements/sqlStore")>();
  return { ...actual, getEntitlementService: () => ({ assertAccess: async () => undefined }) };
});

vi.mock("./db", () => ({
  getDb: vi.fn(),
  getStatusById: vi.fn(),
  getAnimalsByIds: vi.fn(),
  updateAnimal: vi.fn(),
  recordStatusChange: vi.fn(),
  createSale: vi.fn(),
  createAuditEntry: vi.fn(),
}));

const ctx: TrpcContext = {
  user: {
    id: 1, openId: "bulk-sale-test", email: "test@farm.com", name: "Test",
    loginMethod: "manus", role: "admin", createdAt: new Date(),
    updatedAt: new Date(), lastSignedIn: new Date(),
  },
  tenant: {
    companyId: 11, companyPublicId: "01J00000000000000000000000", companySlug: "bulk-sale-test",
    companyLifecycleStatus: "active", userId: 1, membershipId: 31,
    membershipRole: "admin", membershipStatus: "active", authorizationVersion: 1,
    farmAccessMode: "restricted", accessibleFarmIds: [41], selectedFarmId: 41,
    permissionOverrides: {}, sessionId: 51, authenticationLevel: "primary",
    entitlementVersion: 1, requestId: "bulk-sale-test",
  },
  tenantWriteFence: async (_tenant, operation) => operation(),
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};

const input = {
  exitDate: "2024-02-01", exitReason: "sold", newStatusId: 6,
  pricePerKg: "12.50", extraCharge: "1.01", saleNotes: "Buyer collects",
  animals: [
    { id: 1, expectedVersion: 3, weightAtSale: "10.00", salePrice: "1.00", amountPaid: "100.00" },
    { id: 2, expectedVersion: 4, weightAtSale: "20.00", salePrice: "999.00" },
  ],
};
const tx = {};
const transaction = vi.fn(async (operation: (tx: object) => unknown) => operation(tx));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getDb).mockResolvedValue({ transaction } as any);
  vi.mocked(db.getStatusById).mockResolvedValue({ id: 6, name: "Sold", isExitStatus: true } as any);
  vi.mocked(db.getAnimalsByIds).mockResolvedValue(input.animals.map(animal => ({
    animal: { ...animal, animalId: `LMB-${animal.id}`, statusId: 1, isActive: true, acquisitionDate: "2024-01-01" },
  })) as any);
  vi.mocked(db.updateAnimal).mockResolvedValue(1);
  vi.mocked(db.createSale).mockResolvedValue({ insertId: 7 } as any);
});

it("bulkExit recomputes kg prices and records one allocated charge with payments and notes", async () => {
  await expect(animalsRouter.createCaller(ctx).bulkExit(input)).resolves.toEqual({ success: true, count: 2 });
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(db.createSale).toHaveBeenCalledTimes(2);
  expect(db.createSale).toHaveBeenNthCalledWith(1, expect.objectContaining({
    animalId: 1, salePrice: "125.34", amountPaid: "100.00", weightAtSale: "10.00",
    notes: "Buyer collects\nBase price/kg: 12.50\nBulk extra charge: 1.01; this animal's share: 0.34",
  }), tx);
  expect(db.createSale).toHaveBeenNthCalledWith(2, expect.objectContaining({
    animalId: 2, salePrice: "250.67", amountPaid: "250.67", weightAtSale: "20.00",
    notes: "Buyer collects\nBase price/kg: 12.50\nBulk extra charge: 1.01; this animal's share: 0.67",
  }), tx);
  expect(db.updateAnimal).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({ isActive: false }), tx, 3);
  expect(db.updateAnimal).toHaveBeenNthCalledWith(2, 2, expect.objectContaining({ isActive: false }), tx, 4);
  expect(db.createAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
    entityId: "1", newValues: expect.objectContaining({ salePrice: "125.34", extraCharge: "0.34" }),
  }), tx);
});

it.each([undefined, "10kg"])("bulkExit rejects missing or invalid kg weight %s before writes", async weightAtSale => {
  await expect(animalsRouter.createCaller(ctx).bulkExit({
    ...input, animals: [{ ...input.animals[0], weightAtSale }],
  })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(transaction).not.toHaveBeenCalled();
  expect(db.updateAnimal).not.toHaveBeenCalled();
  expect(db.createSale).not.toHaveBeenCalled();
  expect(db.createAuditEntry).not.toHaveBeenCalled();
});
