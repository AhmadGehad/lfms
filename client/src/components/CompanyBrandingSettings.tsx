import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ImageUp, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function CompanyBrandingSettings({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const branding = trpc.config.getCompanyBranding.useQuery();
  const [name, setName] = useState("");
  const canManage = user?.role === "owner" || user?.role === "admin";

  useEffect(() => {
    if (branding.data) setName(branding.data.name);
  }, [branding.data?.name]);

  const refresh = async () => {
    await Promise.all([
      utils.config.getCompanyBranding.invalidate(),
      utils.auth.tenantContext.invalidate(),
    ]);
  };
  const updateName = trpc.config.updateCompanyBrandingName.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success(t("branding.nameSaved", "Company name saved"));
    },
    onError: error => toast.error(error.message),
  });
  const uploadLogo = trpc.config.uploadCompanyBrandingLogo.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success(t("branding.logoSaved", "Company logo updated"));
    },
    onError: error => toast.error(error.message),
  });
  const removeLogo = trpc.config.removeCompanyBrandingLogo.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success(t("branding.logoRemoved", "Company logo removed"));
    },
    onError: error => toast.error(error.message),
  });

  const onLogoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !branding.data) return;
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
      toast.error(t("branding.logoType", "Use a JPEG, PNG, or WebP logo"));
      return;
    }
    if (file.size === 0 || file.size > MAX_LOGO_BYTES) {
      toast.error(t("branding.logoSize", "Logo must be 2MB or smaller"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast.error(t("branding.logoRead", "Could not read the logo file"));
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      uploadLogo.mutate({ dataUrl: reader.result, expectedVersion: branding.data!.version });
    };
    reader.readAsDataURL(file);
  };

  const pending = updateName.isPending || uploadLogo.isPending || removeLogo.isPending;
  const saveName = () => {
    if (!branding.data || name.trim().length < 2) return;
    updateName.mutate({ name: name.trim(), expectedVersion: branding.data.version });
  };

  return (
    <section className={`space-y-4 ${className ?? ""}`} aria-labelledby="company-branding-title">
      <div>
        <h3 id="company-branding-title" className="text-sm font-semibold">{t("branding.title", "Company branding")}</h3>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="company-brand-name">{t("branding.companyName", "Company name")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="company-brand-name"
            maxLength={200}
            value={name}
            onChange={event => setName(event.target.value)}
            disabled={!canManage || branding.isLoading || pending}
          />
          {canManage && (
            <Button type="button" onClick={saveName} disabled={pending || !branding.data || name.trim().length < 2 || name.trim() === branding.data.name}>
              {t("common.save", "Save")}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-md border border-border bg-surface">
          {branding.data?.logoUrl ? (
            <img src={branding.data.logoUrl} alt={`${branding.data.name} ${t("branding.logo", "logo")}`} className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs font-semibold text-muted-foreground">{(branding.data?.name ?? "LFMS").slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        {canManage && (
          <>
            <input id="company-logo-upload" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onLogoSelected} />
            <Button type="button" variant="outline" onClick={() => document.getElementById("company-logo-upload")?.click()} disabled={pending || !branding.data}>
              <ImageUp className="h-4 w-4" />{t("branding.uploadLogo", "Upload logo")}
            </Button>
            {branding.data?.logoUrl && (
              <Button type="button" variant="outline" onClick={() => removeLogo.mutate({ expectedVersion: branding.data!.version })} disabled={pending}>
                <Trash2 className="h-4 w-4" />{t("branding.removeLogo", "Remove logo")}
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
