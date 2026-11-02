import { Suspense } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { lazyPage } from "./lazyPage";
import NewShell from "./NewShell";
import { NewAppRoutes } from "./NewRoutes";

// Its own chunk: nobody but a farm tablet ever downloads it.
const WorkerApp = lazyPage(() => import("@/worker/WorkerApp"));

/**
 * The New design: redesigned shell wrapping the New route table. Redesigned
 * pages (Dashboard, Animals, Animal Profile) are swapped in via NewAppRoutes;
 * not-yet-ported pages render their Old version inside the New shell. Shares all
 * data/permissions with Old.
 *
 * A worker account gets the tablet screen instead, on every URL. The server
 * refuses it everything else regardless; this just keeps it from seeing an app
 * full of access-denied pages.
 */
export default function NewDesign() {
  const { user } = useAuth();
  if (user?.role === "worker") {
    return (
      <Suspense fallback={<main className="min-h-dvh bg-background" aria-busy="true" />}>
        <WorkerApp />
      </Suspense>
    );
  }
  return (
    <NewShell>
      <NewAppRoutes />
    </NewShell>
  );
}
