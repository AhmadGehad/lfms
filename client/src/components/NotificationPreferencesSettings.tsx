import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<string, { title: string; description: string }> = {
  feed_stock: { title: "Feed stock", description: "Low or critical feed stock alerts" },
  vaccination: { title: "Vaccinations", description: "Vaccination and booster due/overdue alerts" },
  pregnancy: { title: "Pregnancy", description: "Pregnancy due date and checkup alerts" },
  growth: { title: "Growth", description: "Target weight and ready-to-sell alerts" },
};

const CATEGORIES = ["feed_stock", "vaccination", "pregnancy", "growth"] as const;
type Category = typeof CATEGORIES[number];
type ChannelPreference = { inApp: boolean; email: boolean };
type Preferences = Partial<Record<Category, ChannelPreference>>;

const DEFAULT_PREFERENCE: ChannelPreference = { inApp: true, email: true };

export function NotificationPreferencesSettings({ className }: { className?: string }) {
  const utils = trpc.useUtils();
  const query = trpc.notifications.preferences.get.useQuery();
  const [preferences, setPreferences] = useState<Preferences>({});

  useEffect(() => {
    if (query.data) setPreferences(query.data as Preferences);
  }, [query.data]);

  const update = trpc.notifications.preferences.set.useMutation({
    onSuccess: () => {
      utils.notifications.preferences.get.invalidate();
      toast.success("Notification preferences saved");
    },
    onError: error => toast.error(error.message),
  });

  function toggle(category: Category, channel: keyof ChannelPreference, value: boolean) {
    const next: Preferences = {
      ...preferences,
      [category]: { ...(preferences[category] ?? DEFAULT_PREFERENCE), [channel]: value },
    };
    setPreferences(next);
    update.mutate({ preferences: next });
  }

  return (
    <div className={className}>
      <h3 className="font-semibold mb-1">Notification preferences</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Choose how you want to be notified for each type of alert in this company.
      </p>
      <div className="space-y-4">
        {CATEGORIES.map(category => {
          const pref = preferences[category] ?? DEFAULT_PREFERENCE;
          const labels = CATEGORY_LABELS[category];
          return (
            <div key={category} className="flex items-center justify-between gap-4 border-b border-border pb-4 last:border-b-0 last:pb-0">
              <div>
                <Label>{labels.title}</Label>
                <p className="text-xs text-muted-foreground">{labels.description}</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={pref.inApp}
                    onCheckedChange={checked => toggle(category, "inApp", checked)}
                    disabled={update.isPending}
                  />
                  <span className="text-xs text-muted-foreground">In-app</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={pref.email}
                    onCheckedChange={checked => toggle(category, "email", checked)}
                    disabled={update.isPending}
                  />
                  <span className="text-xs text-muted-foreground">Email</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
