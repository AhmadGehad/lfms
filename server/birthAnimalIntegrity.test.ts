import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { animals, lambingLog } from "../drizzle/schema";
import { updateAnimal } from "./db";

function createUpdateTx() {
  const writes: Array<{ table: unknown; data: Record<string, unknown> }> = [];
  const tx = {
    update: (table: unknown) => ({
      set: (data: Record<string, unknown>) => ({
        where: async () => {
          writes.push({ table, data });
        },
      }),
    }),
  };
  return { tx, writes };
}

describe("birth-to-animal integrity", () => {
  it("synchronizes parent corrections to the linked birth record", async () => {
    const { tx, writes } = createUpdateTx();

    await updateAnimal(12, { damId: 4, sireId: null }, tx as any);

    expect(writes).toEqual([
      {
        table: animals,
        data: { damId: 4, sireId: null },
      },
      {
        table: lambingLog,
        data: { damId: 4, sireId: null },
      },
    ]);
  });

  it("does not touch birth history for unrelated animal edits", async () => {
    const { tx, writes } = createUpdateTx();

    await updateAnimal(12, { notes: "health check" }, tx as any);

    expect(writes).toEqual([
      {
        table: animals,
        data: { notes: "health check" },
      },
    ]);
  });

  it("allows only one birth record to reference a promoted animal", () => {
    const index = getTableConfig(lambingLog).indexes.find(
      item => item.config.name === "lambing_log_promoted_head_unique",
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns).toContain(lambingLog.promotedHeadId);
  });
});
