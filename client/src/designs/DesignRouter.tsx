import { Component, lazy, Suspense, type ReactNode } from "react";
import { useDesignVersion } from "@/contexts/DesignVersionContext";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";

// Code-split by design so only the active tree ships (ux-audit/11 bundle-size
// mitigation). The inactive design is never downloaded until selected.
const OldDesign = lazy(() => import("./old/OldDesign"));
const NewDesign = lazy(() => import("./new/NewDesign"));

/**
 * Error isolation: if the New design tree throws during render, fall back to Old
 * so the app never hard-fails behind the new UI (ux-audit/11 rollback strategy).
 */
class NewDesignBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[DesignRouter] New design crashed, falling back to Old:", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Picks the Old or New design tree from context. One route tree, shared logic. */
export function DesignRouter() {
  const { design } = useDesignVersion();
  const fallback = <DashboardLayoutSkeleton />;

  if (design === "new") {
    return (
      <Suspense fallback={fallback}>
        <NewDesignBoundary
          fallback={
            <Suspense fallback={fallback}>
              <OldDesign />
            </Suspense>
          }
        >
          <NewDesign />
        </NewDesignBoundary>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={fallback}>
      <OldDesign />
    </Suspense>
  );
}
