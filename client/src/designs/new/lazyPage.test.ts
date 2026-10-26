import { describe, expect, it, vi } from "vitest";
import { lazyPage } from "./lazyPage";

// lazyPage relies on React.lazy's internal `_init`/`_payload`. If a React
// upgrade changes them, pages still work but lose the head start; this test
// is the tripwire.
describe("lazyPage", () => {
  it("downloads once and leaves the lazy component resolved after preload", async () => {
    const Page = () => null;
    const load = vi.fn(async () => ({ default: Page }));
    const LazyPage = lazyPage(load);

    await LazyPage.preload();
    await Promise.resolve();
    await LazyPage.preload();

    expect(load).toHaveBeenCalledTimes(1);
    const internals = LazyPage as unknown as { _init: (payload: unknown) => unknown; _payload: unknown };
    expect(internals._init(internals._payload)).toBe(Page);
  });
});
