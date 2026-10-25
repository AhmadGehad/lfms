import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { toast } from "sonner";
import type { AppRouter } from "../../../server/routers";
import { demoFixtures } from "./mockData";

const RESPONSE_DELAY_MS = 120;

function resolveFixture(path: string, input: unknown): { found: boolean; value?: unknown } {
  let node: unknown = demoFixtures;
  for (const segment of path.split(".")) {
    if (node === null || typeof node !== "object" || !(segment in node)) return { found: false };
    node = (node as Record<string, unknown>)[segment];
  }
  return { found: true, value: typeof node === "function" ? node(input) : node };
}

let lastNoticeAt = 0;
function noticeDemoWrite() {
  // One notice per burst: a form can fire several mutations at once.
  if (Date.now() - lastNoticeAt < 4_000) return;
  lastNoticeAt = Date.now();
  toast.info("This is a demo. Changes are not saved.");
}

/**
 * Terminating link for the walkthrough: answers queries from sample data and
 * acknowledges writes without sending anything to the server.
 */
export const demoLink: TRPCLink<AppRouter> = () => ({ op }) =>
  observable(observer => {
    const timer = window.setTimeout(() => {
      if (op.type === "mutation") {
        if (op.path === "auth.logout") {
          window.location.assign("/");
          return;
        }
        noticeDemoWrite();
        observer.next({ result: { type: "data", data: { success: true } } });
        observer.complete();
        return;
      }

      const fixture = resolveFixture(op.path, op.input);
      if (!fixture.found) {
        console.warn(`[demo] No sample data for ${op.path}`);
        observer.error(TRPCClientError.from(new Error("Not available in the demo")));
        return;
      }
      observer.next({ result: { type: "data", data: fixture.value } });
      observer.complete();
    }, RESPONSE_DELAY_MS);
    return () => window.clearTimeout(timer);
  });
