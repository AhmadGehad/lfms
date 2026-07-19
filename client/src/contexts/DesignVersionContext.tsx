import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import { publicConfig } from "@/lib/publicConfig";

export type DesignVersion = "old" | "new";

interface DesignVersionContextType {
  design: DesignVersion;
  setDesign: (v: DesignVersion) => void;
  /** False when an active dev/QA URL override (?design=) is pinning the value. */
  switchable: boolean;
  /** True until the server preference has reconciled (for skeletons if needed). */
  resolving: boolean;
}

const DesignVersionContext = createContext<DesignVersionContextType | undefined>(undefined);

const LS_KEY = "designVersion";
const ENV_DEFAULT = (publicConfig.defaultDesign || "old") as DesignVersion;

function readUrlOverride(): DesignVersion | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("design");
  return v === "new" || v === "old" ? v : null;
}

function readLocal(): DesignVersion | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(LS_KEY);
  return v === "new" || v === "old" ? v : null;
}

/**
 * Resolves the effective design version (deny-to-default), per
 * ux-audit/11_TECHNICAL_MIGRATION_CONSTRAINTS.md §A:
 *
 *   URL ?design= (dev/QA, non-persistent)
 *   → per-user preference (server, cached in localStorage)
 *   → per-role default + rollout gate (system_settings globals)
 *   → global default (system_settings ui.designVersion)
 *   → env VITE_DEFAULT_DESIGN  → "old" (safe fallback)
 *
 * Bootstraps synchronously from localStorage (no flash), then reconciles with the
 * server preference once it loads.
 */
export function DesignVersionProvider({ children }: { children: React.ReactNode }) {
  const urlOverride = useMemo(readUrlOverride, []);
  const prefs = usePreferences();

  const [design, setDesignState] = useState<DesignVersion>(
    () => urlOverride ?? readLocal() ?? ENV_DEFAULT
  );

  // Reconcile with server once preferences load. A persisted user choice wins;
  // otherwise apply the org default gated by enabled roles. URL override always
  // pins and never persists.
  useEffect(() => {
    if (urlOverride || !prefs.isLoaded) return;
    const userPref = prefs.user["ui.designVersion"];
    if (userPref === "new" || userPref === "old") {
      setDesignState(userPref);
      localStorage.setItem(LS_KEY, userPref);
      return;
    }
    const globalDefault = prefs.globals["ui.designVersion"];
    if (globalDefault === "new" || globalDefault === "old") {
      const enabledRolesRaw = prefs.globals["ui.designVersion.enabledRoles"];
      const roleAllowed =
        globalDefault === "old" ||
        !enabledRolesRaw ||
        (prefs.role != null && enabledRolesRaw.split(",").map(s => s.trim()).includes(prefs.role));
      setDesignState(roleAllowed ? globalDefault : "old");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.isLoaded, urlOverride]);

  const setDesign = (v: DesignVersion) => {
    setDesignState(v);
    if (!urlOverride) {
      localStorage.setItem(LS_KEY, v);
      prefs.setPreference("ui.designVersion", v);
    }
  };

  return (
    <DesignVersionContext.Provider
      value={{ design, setDesign, switchable: !urlOverride, resolving: !prefs.isLoaded && !urlOverride }}
    >
      {children}
    </DesignVersionContext.Provider>
  );
}

export function useDesignVersion() {
  const ctx = useContext(DesignVersionContext);
  if (!ctx) throw new Error("useDesignVersion must be used within DesignVersionProvider");
  return ctx;
}
