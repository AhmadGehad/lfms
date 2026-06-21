import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DesignVersion = "current" | "simple";

const DESIGN_VERSION_STORAGE_KEY = "lfms-design-version";
const DEFAULT_DESIGN_VERSION: DesignVersion = "current";

interface DesignContextValue {
  designVersion: DesignVersion;
  setDesignVersion: (version: DesignVersion) => void;
  toggleDesignVersion: () => void;
}

interface DesignProviderProps {
  children: ReactNode;
}

const DesignContext = createContext<DesignContextValue | undefined>(undefined);

function isDesignVersion(value: string | null): value is DesignVersion {
  return value === "current" || value === "simple";
}

function getInitialDesignVersion(): DesignVersion {
  if (typeof window === "undefined") {
    return DEFAULT_DESIGN_VERSION;
  }

  try {
    const storedVersion = window.localStorage.getItem(
      DESIGN_VERSION_STORAGE_KEY
    );
    return isDesignVersion(storedVersion)
      ? storedVersion
      : DEFAULT_DESIGN_VERSION;
  } catch {
    return DEFAULT_DESIGN_VERSION;
  }
}

export function DesignProvider({ children }: DesignProviderProps) {
  const [designVersion, updateDesignVersion] = useState<DesignVersion>(
    getInitialDesignVersion
  );

  const setDesignVersion = useCallback((version: DesignVersion) => {
    updateDesignVersion(version);
  }, []);

  const toggleDesignVersion = useCallback(() => {
    updateDesignVersion(currentVersion =>
      currentVersion === "current" ? "simple" : "current"
    );
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-design", designVersion);

    try {
      window.localStorage.setItem(DESIGN_VERSION_STORAGE_KEY, designVersion);
    } catch {
      // Storage may be unavailable or full; in-memory switching still works.
    }

    return () => {
      root.removeAttribute("data-design");
    };
  }, [designVersion]);

  const value = useMemo<DesignContextValue>(
    () => ({
      designVersion,
      setDesignVersion,
      toggleDesignVersion,
    }),
    [designVersion, setDesignVersion, toggleDesignVersion]
  );

  return (
    <DesignContext.Provider value={value}>{children}</DesignContext.Provider>
  );
}

export function useDesign() {
  const context = useContext(DesignContext);

  if (!context) {
    throw new Error("useDesign must be used within DesignProvider");
  }

  return context;
}
