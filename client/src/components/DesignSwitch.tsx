import { useDesignVersion } from "@/contexts/DesignVersionContext";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Old / New design switch. This is the per-user rollback control, so both
 * shells render it and a user is never trapped in one design.
 */
export function DesignSwitch({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { design, setDesign, switchable } = useDesignVersion();
  const { t } = useTranslation();
  if (!switchable) return null;

  const nextDesign = design === "new" ? "old" : "new";
  const nextLabel =
    nextDesign === "new"
      ? t("design.switchToNew", "Switch to New design")
      : t("design.switchToOld", "Switch to Classic design");

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setDesign(nextDesign)}
        aria-label={nextLabel}
        title={nextLabel}
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground/70 shadow-sm hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:h-9 sm:w-9",
          className,
        )}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("design.label", "Design version")}
      className={cn(
        "inline-flex min-h-11 items-center rounded-lg border border-border bg-card p-0.5 text-xs font-medium sm:min-h-8",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setDesign("old")}
        aria-pressed={design === "old"}
        className={cn(
          "min-h-10 rounded-md px-3 py-1 transition-colors sm:min-h-7 sm:px-2.5",
          design === "old"
            ? "bg-secondary text-secondary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("design.old", "Classic")}
      </button>
      <button
        type="button"
        onClick={() => setDesign("new")}
        aria-pressed={design === "new"}
        className={cn(
          "flex min-h-10 items-center gap-1 rounded-md px-3 py-1 transition-colors sm:min-h-7 sm:px-2.5",
          design === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {t("design.new", "New")}
      </button>
    </div>
  );
}
