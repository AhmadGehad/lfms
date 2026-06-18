import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSION_PAGES } from "@shared/permissions";

export default function AccessDenied() {
  const { t } = useTranslation();
  const permissions = usePermissions();
  const firstAllowedPath = PERMISSION_PAGES.find(page =>
    permissions.can(page.id, "view"),
  )?.path;

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <ShieldX className="h-12 w-12 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">
              {t("permissions.accessDenied")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("permissions.accessDeniedDescription")}
            </p>
          </div>
          {firstAllowedPath && (
            <Button asChild>
              <a href={firstAllowedPath}>{t("permissions.backToDashboard")}</a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
