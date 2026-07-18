import { describe, expect, it, vi } from "vitest";
import { findPlanByPublicId } from "./plans";

describe("plan repository locking", () => {
  it("holds an exclusive plan lock for transactional assignment callers on TiDB", async () => {
    const lock = vi.fn().mockResolvedValue([{ id: 1, status: "active" }]);
    const query: any = {
      from: () => query,
      where: () => query,
      limit: () => query,
      for: lock,
    };
    const db = { select: () => query } as any;

    await expect(findPlanByPublicId("01J00000000000000000000001", db))
      .resolves.toMatchObject({ id: 1, status: "active" });
    expect(lock).toHaveBeenCalledWith("update");
  });
});
