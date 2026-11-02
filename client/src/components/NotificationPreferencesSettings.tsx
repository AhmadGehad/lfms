import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const CATEGORIES = ["tasks", "feed_stock", "vaccination", "pregnancy", "growth"] as const;
type Category = typeof CATEGORIES[number];
type ChannelPreference = { inApp: boolean; email: boolean; push: boolean };
type Preferences = Partial<Record<Category, ChannelPreference>>;

const DEFAULT_PREFERENCE: ChannelPreference = { inApp: true, email: true, push: true };
const CHANNELS = ["inApp", "email", "push"] as const;

export function NotificationPreferencesSettings({ className }: { className?: string }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const query = trpc.notifications.preferences.get.useQuery();
  const [preferences, setPreferences] = useState<Preferences>({});

  useEffect(() => {
    if (query.data) setPreferences(query.data as Preferences);
  }, [query.data]);

  const update = trpc.notifications.preferences.set.useMutation({
    onSuccess: () => {
      utils.notifications.preferences.get.invalidate();
      toast.success(t("notificationSettings.saved", "Notification preferences saved"));
    },
    onError: error => toast.error(error.message),
  });

  function toggle(category: Category, channel: keyof ChannelPreference, value: boolean) {
    const next: Preferences = {
      ...preferences,
      [category]: { ...DEFAULT_PREFERENCE, ...preferences[category], [channel]: value },
    };
    setPreferences(next);
    update.mutate({ preferences: next });
  }

  return (
    <div className={className}>
      <h3 className="font-semibold mb-1">{t("notificationSettings.title", "Notification preferences")}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {t("notificationSettings.subtitle", "Choose how you want to be notified for each type of alert. Email and phone notifications are only sent for urgent alerts.")}
      </p>
      <div className="space-y-4">
        {CATEGORIES.map(category => {
          const pref = { ...DEFAULT_PREFERENCE, ...preferences[category] };
          return (
            <div key={category} className="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
              <div>
                <p className="text-sm font-medium">{t(`notificationSettings.${category}.title`)}</p>
                <p className="text-xs text-muted-foreground">{t(`notificationSettings.${category}.description`)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {CHANNELS.map(channel => (
                  <div key={channel} className="flex items-center gap-2">
                    <Switch
                      id={`notify-${category}-${channel}`}
                      checked={pref[channel]}
                      onCheckedChange={checked => toggle(category, channel, checked)}
                      disabled={update.isPending}
                    />
                    <Label htmlFor={`notify-${category}-${channel}`} className="text-xs font-normal text-muted-foreground">
                      {t(`notificationSettings.channel.${channel}`)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
