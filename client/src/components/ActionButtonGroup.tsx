import { useAuth } from "@/lib/auth";
import { ReactNode } from "react";

interface ActionButtonGroupProps {
  children: ReactNode;
  /**
   * If true, shows a disabled state with message for viewers.
   * If false, hides the entire group for viewers.
   */
  showDisabledForViewers?: boolean;
}

/**
 * Wrapper for action button groups that hides/disables actions for viewers.
 * Use this to wrap groups of Add, Edit, Delete buttons.
 */
export function ActionButtonGroup({ 
  children,
  showDisabledForViewers = false
}: ActionButtonGroupProps) {
  const { user } = useAuth();
  const isViewer = user?.role === "viewer";

  if (isViewer && !showDisabledForViewers) {
    return null;
  }

  return (
    <div 
      className={isViewer && showDisabledForViewers ? "opacity-50 pointer-events-none" : ""}
      title={isViewer ? "Viewers cannot perform actions" : undefined}
    >
      {children}
    </div>
  );
}
