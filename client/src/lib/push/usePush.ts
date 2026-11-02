import { isIos, isRunningInstalled } from "@/lib/pwa/installEligibility";
import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export type PushState =
  | "loading"
  | "unsupported"
  /** iPhones only offer push once the app is on the Home Screen. */
  | "needs-install"
  | "not-configured"
  | "denied"
  | "off"
  | "on";

const READY_TIMEOUT_MS = 4_000;

function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The service worker registers after load, and never in development, so don't wait forever. */
async function serviceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), READY_TIMEOUT_MS));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function currentPushSubscription() {
  const registration = await serviceWorkerRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Removes this device on sign-out. Best effort: signing out must never fail because of it. */
export async function forgetPushDevice(removeOnServer: (endpoint: string) => Promise<unknown>) {
  if (!isPushSupported()) return;
  try {
    const subscription = await currentPushSubscription();
    if (!subscription) return;
    await removeOnServer(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // Nothing to do; the server also moves a device to whoever signs in next.
  }
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function subscriptionInput(subscription: PushSubscription, language: string) {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth, language: language === "ar" ? "ar" as const : "en" as const };
}

/** Whether this device gets push notifications, and the controls to change that. */
export function usePush() {
  const { i18n } = useTranslation();
  const config = trpc.notifications.push.config.useQuery(undefined, { staleTime: Infinity });
  const save = trpc.notifications.push.subscribe.useMutation();
  const remove = trpc.notifications.push.unsubscribe.useMutation();
  const test = trpc.notifications.push.test.useMutation();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState(() => ("Notification" in window ? Notification.permission : "default"));
  const publicKey = config.data?.publicKey ?? null;

  useEffect(() => {
    if (!isPushSupported()) return;
    let cancelled = false;
    void currentPushSubscription().then(subscription => {
      if (!cancelled) setSubscribed(Boolean(subscription));
    });
    return () => { cancelled = true; };
  }, []);

  const needsInstall = isIos(navigator.userAgent) && !isRunningInstalled(window);
  let state: PushState;
  if (needsInstall) state = "needs-install";
  else if (!isPushSupported()) state = "unsupported";
  else if (config.isLoading || subscribed === null) state = "loading";
  else if (!publicKey) state = "not-configured";
  else if (permission === "denied") state = "denied";
  else state = subscribed ? "on" : "off";

  /** Browsers only show the permission question in response to a tap, so call this from one. */
  const enable = useCallback(async () => {
    if (!publicKey) return false;
    setBusy(true);
    try {
      const answer = await Notification.requestPermission();
      setPermission(answer);
      if (answer !== "granted") return false;
      const registration = await serviceWorkerRegistration();
      if (!registration) return false;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
      const input = subscriptionInput(subscription, i18n.language);
      if (!input) return false;
      await save.mutateAsync(input);
      setSubscribed(true);
      return true;
    } finally {
      setBusy(false);
    }
  }, [i18n.language, publicKey, save]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const subscription = await currentPushSubscription();
      if (subscription) {
        await remove.mutateAsync({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [remove]);

  return { state, busy, enable, disable, sendTest: test.mutateAsync, testing: test.isPending };
}

/**
 * Keeps the server's copy of this device current: the language its notifications
 * are written in, and the address, which browsers occasionally renew.
 */
export function usePushSync(enabled: boolean) {
  const { i18n } = useTranslation();
  const { mutate } = trpc.notifications.push.subscribe.useMutation();
  const language = i18n.language;
  useEffect(() => {
    if (!enabled || !isPushSupported() || Notification.permission !== "granted") return;
    let cancelled = false;
    void currentPushSubscription().then(subscription => {
      const input = subscription && subscriptionInput(subscription, language);
      if (input && !cancelled) mutate(input);
    });
    return () => { cancelled = true; };
  }, [enabled, language, mutate]);
}
