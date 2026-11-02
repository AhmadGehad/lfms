import "@fontsource-variable/manrope";
import { lazy, Suspense, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { trpc } from "@/lib/trpc";
import NewDesign from "@/designs/new/NewDesign";
import { applyOptimisticRow } from "@/lib/offline/optimistic";
import { offlineQueryKey } from "@/lib/offline/prefetch";
import { demoFixtures } from "./mockData";
import { demoLink } from "./mockLink";
import { DEMO_STYLES, DemoBar, GuideTour, HelpMarks } from "./DemoGuide";

const WorkerApp = lazy(() => import("@/worker/WorkerApp"));
// A demo visitor shouldn't be asked for their camera.
const noCamera = async () => null;

const TOUR_DONE_KEY = "apis-demo-tour-done";

function readTourDone() {
  try {
    return window.localStorage.getItem(TOUR_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTourDone() {
  try {
    window.localStorage.setItem(TOUR_DONE_KEY, "1");
  } catch {
    // Private mode or blocked storage: the tour simply offers itself again.
  }
}

// Its own client, separate from the app's persisted one: sample data must
// never land in the offline cache, and there is no session to expire.
const demoQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity, networkMode: "always" },
    mutations: { retry: false, networkMode: "always" },
  },
});
const demoTrpcClient = trpc.createClient({ links: [demoLink] });

// The tablet preview answers taps locally. Written back to the fixture so the
// screen's one-minute refresh doesn't undo them.
for (const action of ["recordAction", "submitReport"] as const) {
  demoQueryClient.setMutationDefaults([["tasks", action]], {
    onMutate: input => {
      const snapshot = applyOptimisticRow(demoQueryClient, `tasks.${action}`, input);
      const key = offlineQueryKey("tasks.today", undefined);
      (demoFixtures.tasks as { today: unknown }).today = demoQueryClient.getQueryData(key);
      return snapshot;
    },
  });
}

function useDemoDocumentBranding() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "APIS · Walkthrough";
    return () => {
      document.title = previousTitle;
    };
  }, []);
}

function Walkthrough() {
  const [tourStep, setTourStep] = useState<number | null>(() => (readTourDone() ? null : 0));
  const [helpOn, setHelpOn] = useState(true);

  const closeTour = () => {
    setTourStep(null);
    writeTourDone();
  };

  return (
    <>
      <NewDesign />
      {tourStep !== null && <GuideTour step={tourStep} onStep={setTourStep} onClose={closeTour} />}
      {tourStep === null && helpOn && <HelpMarks />}
      <DemoBar helpOn={helpOn} onToggleHelp={() => setHelpOn(on => !on)} onRestart={() => setTourStep(0)} />
    </>
  );
}

/**
 * Public walkthrough at /demo: the real application screens, answered by
 * sample data instead of the server, with a guided tour and "?" marks.
 */
export default function DemoApp() {
  useDemoDocumentBranding();
  return (
    <trpc.Provider client={demoTrpcClient} queryClient={demoQueryClient}>
      <QueryClientProvider client={demoQueryClient}>
        <Router base="/demo">
            <div data-demo>
              <style>{DEMO_STYLES}</style>
              {/* The farm tablet's screen, full size, without the tour on top of it. */}
              {window.location.pathname === "/demo/worker" ? (
                <Suspense fallback={<main className="min-h-dvh bg-background" aria-busy="true" />}>
                  <WorkerApp takePhoto={noCamera} />
                </Suspense>
              ) : (
                <Walkthrough />
              )}
            </div>
        </Router>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
