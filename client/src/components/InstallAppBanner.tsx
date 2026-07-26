/**
 * Invitation to install the app to the home screen.
 *
 * Needed because neither platform reliably tells the user on its own: Chrome
 * buries "Install app" in a menu, and iOS Safari has no install API at all, so
 * an iPhone user would never discover it. Since the offline features only work
 * from the installed app on iOS, this is the difference between the feature
 * existing and the feature being used.
 *
 * Mounted once at the app root, so it appears in both design systems.
 */
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/lib/pwa/useInstallPrompt";
import { Download, Share, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export function InstallAppBanner() {
  const { t } = useTranslation();
  const { method, install, dismiss } = useInstallPrompt();

  if (method === "none") return null;

  return (
    <div
      role="region"
      aria-label={t("install.title", "Install LFMS")}
      // Sits above the mobile bottom nav, below dialogs.
      className="fixed inset-x-2 bottom-2 z-30 rounded-xl border border-border bg-card p-3 shadow-lg sm:inset-x-auto sm:end-4 sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Download className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {t("install.title", "Install LFMS on this phone")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {method === "prompt"
              ? t(
                  "install.bodyPrompt",
                  "Add it to your home screen to record weights and vaccinations even with no network.",
                )
              : t(
                  "install.bodyManual",
                  "Tap Share, then “Add to Home Screen”, to record weights and vaccinations even with no network.",
                )}
          </p>

          {method === "prompt" ? (
            <Button size="sm" className="mt-2 gap-1.5" onClick={() => void install()}>
              <Download className="h-3.5 w-3.5" />
              {t("install.action", "Install app")}
            </Button>
          ) : (
            // iOS gives no programmatic install, so all we can do is point at
            // the share sheet.
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium">
              <Share className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("install.iosHint", "Share → Add to Home Screen")}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          onClick={dismiss}
          aria-label={t("install.dismiss", "Dismiss")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
