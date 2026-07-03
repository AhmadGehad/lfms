import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OwnerFilterProvider } from "./contexts/OwnerFilterContext";
import { DesignVersionProvider } from "./contexts/DesignVersionContext";
import { DesignRouter } from "./designs/DesignRouter";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <DesignVersionProvider>
          <OwnerFilterProvider>
            <TooltipProvider>
              <Toaster richColors position="top-right" />
              <DesignRouter />
            </TooltipProvider>
          </OwnerFilterProvider>
        </DesignVersionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
