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
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { OfflineSyncIndicator } from "@/components/OfflineSyncIndicator";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Leaf } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const SIGN_OUT_HOLD_MS = 3_000;

/** Long weekday and date, with the Western digits used across the app. */
function formatDay(date: string, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * Date, progress and the farm logo. The logo doubles as the way out: pressing it
 * for three seconds offers sign-out, for whoever maintains the tablet, without
 * putting a button in front of the workers.
 */
export function WorkerHeader({ date, doneCount, total }: { date?: string; doneCount: number; total: number }) {
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const tenantContext = trpc.auth.tenantContext.useQuery(undefined, { staleTime: 60_000, retry: false });
  const company = tenantContext.data?.company;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);

  const stopHold = () => window.clearTimeout(holdTimer.current);
  const startHold = () => {
    stopHold();
    holdTimer.current = window.setTimeout(() => setConfirmOpen(true), SIGN_OUT_HOLD_MS);
  };
  useEffect(() => stopHold, []);

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card px-5 py-3">
      <div
        className="grid h-14 w-14 shrink-0 touch-manipulation select-none place-items-center rounded-xl bg-secondary"
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onContextMenu={event => event.preventDefault()}
        data-testid="worker-logo"
      >
        {company?.logoUrl ? (
          <img src={company.logoUrl} alt={company.name} draggable={false} className="h-full w-full rounded-xl object-contain" />
        ) : (
          <Leaf aria-hidden="true" className="h-8 w-8 text-primary" />
        )}
      </div>
      <h1 className="min-w-0 flex-1 text-2xl font-bold text-foreground sm:text-3xl">
        {date ? formatDay(date, i18n.language) : t("worker.title", "Today's tasks")}
      </h1>
      {total > 0 && (
        <p className="shrink-0 text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
          {t("worker.progress", { defaultValue: "Done {{done}} of {{total}}", done: doneCount, total })}
        </p>
      )}
      <OfflineSyncIndicator />
      <LanguageSwitcher />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl">{t("worker.signOutTitle", "Sign this tablet out?")}</AlertDialogTitle>
            <AlertDialogDescription className="text-lg">
              {t("worker.signOutBody", "Someone will need the tablet's password to sign back in.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-14 text-lg">{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-14 text-lg" onClick={() => void logout()}>
              {t("nav.logout", "Sign out")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
