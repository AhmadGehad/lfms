import type { StatusTone } from "../components/StatusBadge";

export function weightTargetPercent(currentWeight: unknown, targetWeight: unknown): number | null {
  const current = parseFloat(String(currentWeight ?? ""));
  const target = parseFloat(String(targetWeight ?? ""));
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return null;
  return (current / target) * 100;
}

export function weightProgressTone(percent: number | null, thresholdPercent = 80): StatusTone {
  if (percent == null) return "neutral";
  if (percent >= 100) return "success";
  if (percent >= thresholdPercent) return "warning";
  return "danger";
}

export function weightProgressTextClass(tone: StatusTone) {
  switch (tone) {
    case "success": return "text-success-soft-foreground";
    case "warning": return "text-warning-soft-foreground";
    case "danger": return "text-danger-soft-foreground";
    default: return "text-muted-foreground";
  }
}

export function weightProgressPillClass(tone: StatusTone) {
  switch (tone) {
    case "success": return "bg-success-soft text-success-soft-foreground";
    case "warning": return "bg-warning-soft text-warning-soft-foreground";
    case "danger": return "bg-danger-soft text-danger-soft-foreground";
    default: return "bg-secondary text-secondary-foreground";
  }
}

export function weightProgressBarClass(tone: StatusTone) {
  switch (tone) {
    case "success": return "bg-success";
    case "warning": return "bg-warning";
    case "danger": return "bg-danger";
    default: return "bg-primary";
  }
}

export function signedPercentClass(percent: number | null) {
  if (percent == null || percent === 0) return "text-muted-foreground";
  return percent > 0 ? "text-success-soft-foreground" : "text-danger-soft-foreground";
}

export function signedPercentPillClass(percent: number | null) {
  if (percent == null || percent === 0) return "bg-secondary text-secondary-foreground";
  return percent > 0
    ? "bg-success-soft text-success-soft-foreground"
    : "bg-danger-soft text-danger-soft-foreground";
}
