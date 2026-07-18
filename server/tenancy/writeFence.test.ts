import { describe, expect, it } from "vitest";
import type { TenantContext } from "../../shared/tenancy";
import { getDb, type DbOrTx } from "../db";
import { runWithTenantWriteFence } from "./writeFence";

class ReadWriteLock {
  private readers = 0;
  private writer = false;
  private readonly queue: Array<{
    mode: "share" | "update";
    resolve: (release: () => void) => void;
  }> = [];

  acquire(mode: "share" | "update") {
    return new Promise<() => void>(resolve => {
      this.queue.push({ mode, resolve });
      this.drain();
    });
  }

  private drain() {
    if (this.writer || this.queue.length === 0) return;
    if (this.queue[0].mode === "update") {
      if (this.readers > 0) return;
      this.writer = true;
      this.queue.shift()!.resolve(() => {
        this.writer = false;
        this.drain();
      });
      return;
    }
    while (this.queue[0]?.mode === "share" && !this.writer) {
      this.readers += 1;
      this.queue.shift()!.resolve(() => {
        this.readers -= 1;
        this.drain();
      });
    }
  }
}

function fakeDatabase() {
  const lock = new ReadWriteLock();
  let status: "active" | "suspended" = "active";
  const transactions: unknown[] = [];

  const db = {
    transaction: async (operation: (tx: any) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      const builder: any = {
        from: () => builder,
        where: () => builder,
        limit: () => builder,
        for: async (mode: "share" | "update") => {
          release = await lock.acquire(mode);
          return [{ lifecycleStatus: status }];
        },
      };
      const tx: any = {
        select: () => builder,
        transaction: async (nested: (nestedTx: any) => Promise<unknown>) => nested(tx),
      };
      transactions.push(tx);
      try {
        return await operation(tx);
      } finally {
        release?.();
      }
    },
  } as unknown as DbOrTx;

  return {
    db,
    transactions,
    suspend: async () => db.transaction(async (tx: any) => {
      await tx.select().from(null).where(null).limit(1).for("update");
      status = "suspended";
    }),
  };
}

const tenant = { companyId: 7 } as TenantContext;

describe("tenant write fence", () => {
  it("holds a shared company lock through commit and blocks later writes after suspension", async () => {
    const fake = fakeDatabase();
    let releaseWrite!: () => void;
    const writeCanFinish = new Promise<void>(resolve => { releaseWrite = resolve; });
    let writeStarted!: () => void;
    const started = new Promise<void>(resolve => { writeStarted = resolve; });

    const write = runWithTenantWriteFence(tenant, async () => {
      expect(await getDb()).toBe(fake.transactions[0]);
      writeStarted();
      await writeCanFinish;
      return "committed";
    }, fake.db);
    await started;

    let suspensionFinished = false;
    const suspension = fake.suspend().then(() => { suspensionFinished = true; });
    await Promise.resolve();
    expect(suspensionFinished).toBe(false);

    releaseWrite();
    await expect(write).resolves.toBe("committed");
    await suspension;
    await expect(runWithTenantWriteFence(tenant, async () => "late", fake.db))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
