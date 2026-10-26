import "@fontsource-variable/manrope";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { trpc } from "@/lib/trpc";
import { DesignVersionProvider } from "@/contexts/DesignVersionContext";
import NewDesign from "@/designs/new/NewDesign";
import { demoLink } from "./mockLink";
import { DEMO_STYLES, DemoBar, GuideTour, HelpMarks } from "./DemoGuide";

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
        <DesignVersionProvider>
          <Router base="/demo">
            <div data-demo>
              <style>{DEMO_STYLES}</style>
              <Walkthrough />
            </div>
          </Router>
        </DesignVersionProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
