import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Consequence {
  text: React.ReactNode;
  tone?: "warning" | "danger" | "info";
}

/**
 * Confirmation that SURFACES a consequential side-effect before it happens
 * (F-SALE1/PROF4/BR1/RB1/DATA1) — sale auto-exits the animal, weighing
 * auto-changes its stage, birth auto-closes a pregnancy, purge/cascade is
 * irreversible. The business behaviour is unchanged; the user is just told.
 */
export function ConsequenceConfirm({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  consequences?: Consequence[];
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  destructive?: boolean;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>

        {consequences && consequences.length > 0 && (
          <ul className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            {consequences.map((c, i) => {
              const tone = c.tone ?? "warning";
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      tone === "danger" && "text-danger",
                      tone === "warning" && "text-warning",
                      tone === "info" && "text-info"
                    )}
                  />
                  <span className="text-foreground">{c.text}</span>
                </li>
              );
            })}
          </ul>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
