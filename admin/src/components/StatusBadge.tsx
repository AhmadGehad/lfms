import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  active: "border-success/30 bg-success-soft text-success-soft-foreground",
  enabled: "border-success/30 bg-success-soft text-success-soft-foreground",
  healthy: "border-success/30 bg-success-soft text-success-soft-foreground",
  succeeded: "border-success/30 bg-success-soft text-success-soft-foreground",
  success: "border-success/30 bg-success-soft text-success-soft-foreground",
  provisioning: "border-info/30 bg-info-soft text-info-soft-foreground",
  pending: "border-info/30 bg-info-soft text-info-soft-foreground",
  info: "border-info/30 bg-info-soft text-info-soft-foreground",
  read_only: "border-warning/30 bg-warning-soft text-warning-soft-foreground",
  warning: "border-warning/30 bg-warning-soft text-warning-soft-foreground",
  degraded: "border-warning/30 bg-warning-soft text-warning-soft-foreground",
  suspended: "border-danger/30 bg-danger-soft text-danger-soft-foreground",
  disabled: "border-border bg-muted text-muted-foreground",
  unavailable: "border-danger/30 bg-danger-soft text-danger-soft-foreground",
  failed: "border-danger/30 bg-danger-soft text-danger-soft-foreground",
  denied: "border-danger/30 bg-danger-soft text-danger-soft-foreground",
  error: "border-danger/30 bg-danger-soft text-danger-soft-foreground",
  high: "border-danger/30 bg-danger-soft text-danger-soft-foreground",
  critical: "border-danger bg-danger text-danger-foreground",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap rounded-sm font-medium capitalize", tones[value] || "bg-muted text-muted-foreground")}>
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
