import { Button } from "@/components/ui/button";
import { usePush, type PushState } from "@/lib/push/usePush";
import { BellRing, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const PROMPT_DISMISSED_KEY = "apis-push-prompt-dismissed";

function PushControls({ push }: { push: ReturnType<typeof usePush> }) {
  const { t } = useTranslation();
  const failed = () => toast.error(t("push.failed", "That didn't work. Please try again."));

  const turnOn = () => {
    push.enable().then(on => {
      if (on) toast.success(t("push.enabled", "Notifications are on for this device"));
      // Allowed but still not on. A refusal explains itself: the card changes to say so.
      else if (Notification.permission === "granted") failed();
    }).catch(failed);
  };

  if (push.state === "off") {
    return <Button size="sm" disabled={push.busy} onClick={turnOn}>{t("push.enable", "Turn on for this device")}</Button>;
  }
  if (push.state !== "on") return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={push.testing}
        onClick={() => {
          push.sendTest().then(({ sent }) => {
            if (sent > 0) toast.success(t("push.testSent", "Sent. It should arrive in a moment."));
            else failed();
          }).catch(failed);
        }}
      >
        {t("push.test", "Send a test")}
      </Button>
      <Button size="sm" variant="ghost" disabled={push.busy} onClick={() => { push.disable().catch(failed); }}>
        {t("push.disable", "Turn off")}
      </Button>
    </div>
  );
}

function useStateText() {
  const { t } = useTranslation();
  return (state: PushState): string | null => {
    switch (state) {
      case "needs-install": return t("push.needsInstall", "On iPhone, first tap Share, then Add to Home Screen. Open the app from there and turn this on.");
      case "unsupported": return t("push.unsupported", "This browser can't receive notifications.");
      case "not-configured": return t("push.notConfigured", "Notifications to your phone aren't available yet.");
      case "denied": return t("push.denied", "Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.");
      case "off": return t("push.off", "Get what workers do and urgent alerts on this device, even when the app is closed.");
      case "on": return t("push.on", "On for this device. What workers do and urgent alerts arrive even when the app is closed.");
      default: return null;
    }
  };
}

/** For settings: every state, so it's clear why something isn't available. */
export function PushNotificationsCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const push = usePush();
  const text = useStateText()(push.state);
  return (
    <div className={className}>
      <h3 className="mb-1 font-semibold">{t("push.title", "Notifications on this device")}</h3>
      {text && <p className="mb-3 text-xs text-muted-foreground">{text}</p>}
      <PushControls push={push} />
    </div>
  );
}

function wasDismissed() {
  try {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** A nudge on the notifications page, which everyone can open. Only shown while there's a choice to make. */
export function PushNotificationsPrompt() {
  const { t } = useTranslation();
  const push = usePush();
  const text = useStateText()(push.state);
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (dismissed || (push.state !== "off" && push.state !== "needs-install")) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
    } catch {
      // Not remembered this time; it can be dismissed again.
    }
  };

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-border bg-card p-3">
      <BellRing aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-foreground">{text}</p>
        <PushControls push={push} />
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.dismiss", "Dismiss")}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
