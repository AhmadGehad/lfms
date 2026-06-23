import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

// Global owner filter. A single selection here scopes EVERY page to one owner:
// all data and numbers reflect only that owner's animals, and farm-wide costs
// that aren't attributable to an owner (general overhead like electricity,
// herd-wide expenses, bulk feed purchases) are excluded. `null` = all owners
// (whole-farm view).
interface OwnerFilterContextType {
  ownerId: number | null;
  setOwnerId: (id: number | null) => void;
  /** Convenience for tRPC inputs: the numeric id, or undefined when unscoped. */
  ownerParam: number | undefined;
}

const OwnerFilterContext = createContext<OwnerFilterContextType | undefined>(undefined);

const STORAGE_KEY = "lfms-owner-filter";

export function OwnerFilterProvider({ children }: { children: React.ReactNode }) {
  const [ownerId, setOwnerIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored || stored === "all") return null;
    const n = Number(stored);
    return Number.isFinite(n) && n > 0 ? n : null;
  });

  useEffect(() => {
    if (ownerId == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(ownerId));
  }, [ownerId]);

  const value = useMemo<OwnerFilterContextType>(
    () => ({
      ownerId,
      setOwnerId: setOwnerIdState,
      ownerParam: ownerId ?? undefined,
    }),
    [ownerId],
  );

  return <OwnerFilterContext.Provider value={value}>{children}</OwnerFilterContext.Provider>;
}

export function useOwnerFilter() {
  const context = useContext(OwnerFilterContext);
  if (!context) {
    throw new Error("useOwnerFilter must be used within OwnerFilterProvider");
  }
  return context;
}
