import {
  EmptyState,
  PageHeader,
  PageShell,
  PageToolbar,
  StatCard,
} from "@/components/simple";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  DollarSign,
  Leaf,
  PackageCheck,
  Scale,
  Syringe,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";

interface SimpleDashboardKpis {
  totalActiveHeads?: number;
  totalRevenue?: number;
  totalExpenses?: number;
  grossPnL?: number;
  outstandingReceivables?: number;
  cashReceived?: number;
}

interface SimpleDashboardProps {
  dateLabel: string;
  controls: ReactNode;
  kpis?: SimpleDashboardKpis;
  loading: boolean;
  formatCurrency: (value: number) => string;
  criticalFeedCount: number;
  lowFeedCount: number;
  overdueVaccinationCount: number;
  dueSoonVaccinationCount: number;
  canView: {
    animals: boolean;
    feed: boolean;
    vaccinations: boolean;
    expenses: boolean;
    sales: boolean;
  };
}

export function SimpleDashboard({
  dateLabel,
  controls,
  kpis,
  loading,
  formatCurrency,
  criticalFeedCount,
  lowFeedCount,
  overdueVaccinationCount,
  dueSoonVaccinationCount,
  canView,
}: SimpleDashboardProps) {
  const { t } = useTranslation();
  const attentionItems = [
    {
      count: criticalFeedCount,
      label: `${t("nav.feed")}: ${t("dashboard.critical")}`,
      href: "/feed",
      icon: PackageCheck,
      tone: "text-destructive",
      canNavigate: canView.feed,
    },
    {
      count: lowFeedCount,
      label: `${t("nav.feed")}: ${t("dashboard.lowStock")}`,
      href: "/feed",
      icon: PackageCheck,
      tone: "text-amber-700 dark:text-amber-400",
      canNavigate: canView.feed,
    },
    {
      count: overdueVaccinationCount,
      label: t("vaccine.overdue"),
      href: "/vaccinations",
      icon: Syringe,
      tone: "text-destructive",
      canNavigate: canView.vaccinations,
    },
    {
      count: dueSoonVaccinationCount,
      label: t("vaccine.due"),
      href: "/vaccinations",
      icon: Syringe,
      tone: "text-amber-700 dark:text-amber-400",
      canNavigate: canView.vaccinations,
    },
  ].filter(item => item.count > 0);

  const quickActions = [
    { href: "/animals", label: t("nav.animals"), visible: canView.animals },
    { href: "/feed", label: t("nav.feed"), visible: canView.feed },
    { href: "/expenses", label: t("nav.expenses"), visible: canView.expenses },
    { href: "/sales", label: t("nav.sales"), visible: canView.sales },
  ].filter(action => action.visible);

  return (
    <PageShell className="mx-auto max-w-[1440px]">
      <PageHeader title={t("dashboard.title")} description={dateLabel} />
      <PageToolbar aria-label={t("dashboard.title")}>
        <div className="flex flex-wrap items-center gap-2">{controls}</div>
      </PageToolbar>

      <section aria-labelledby="home-kpis">
        <h2 id="home-kpis" className="sr-only">
          {t("dashboard.title")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title={t("dashboard.activeAnimals")}
            value={kpis?.totalActiveHeads ?? 0}
            icon={<Leaf />}
            loading={loading}
            tone="positive"
          />
          <StatCard
            title={t("animals.totalRevenue")}
            value={formatCurrency(kpis?.totalRevenue ?? 0)}
            icon={<TrendingUp />}
            loading={loading}
            tone="positive"
          />
          <StatCard
            title={t("dashboard.totalExpenses")}
            value={formatCurrency(kpis?.totalExpenses ?? 0)}
            icon={<Scale />}
            loading={loading}
            tone="destructive"
          />
          <StatCard
            title={t("dashboard.netPnLForPeriod")}
            value={formatCurrency(kpis?.grossPnL ?? 0)}
            icon={<DollarSign />}
            loading={loading}
            tone={(kpis?.grossPnL ?? 0) >= 0 ? "positive" : "destructive"}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4" aria-hidden="true" />
                {t("dashboard.attention")}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attentionItems.length === 0 ? (
              <EmptyState
                title={t("dashboard.noUrgentWork")}
                description={t("dashboard.noUrgentWorkDescription")}
                icon={<PackageCheck />}
                className="min-h-40 border"
                headingLevel={3}
              />
            ) : (
              <ul className="divide-y">
                {attentionItems.map(item => (
                  <li key={`${item.href}-${item.label}`}>
                    {item.canNavigate ? (
                      <Link
                        href={item.href}
                        className="flex min-h-12 items-center gap-3 rounded-md px-2 py-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <item.icon
                          className={`size-4 shrink-0 ${item.tone}`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          {item.label}
                        </span>
                        <span
                          className={`font-semibold tabular-nums ${item.tone}`}
                        >
                          {item.count}
                        </span>
                      </Link>
                    ) : (
                      <div className="flex min-h-12 items-center gap-3 px-2 py-3">
                        <item.icon
                          className={`size-4 shrink-0 ${item.tone}`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          {item.label}
                        </span>
                        <span
                          className={`font-semibold tabular-nums ${item.tone}`}
                        >
                          {item.count}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base">{t("dashboard.quickActions")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {quickActions.map(action => (
              <Button
                key={action.href}
                asChild
                variant="outline"
                className="justify-start"
              >
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {(kpis?.outstandingReceivables ?? 0) > 0 ? (
        <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center">
            <span className="text-sm font-medium">
              {t("dashboard.outstandingReceivables")}
            </span>
            <span className="font-semibold text-amber-800 tabular-nums dark:text-amber-300">
              {formatCurrency(kpis?.outstandingReceivables ?? 0)}
              <span className="ms-2 text-xs font-normal text-muted-foreground">
                ({t("dashboard.cashReceived")}:{" "}
                {formatCurrency(kpis?.cashReceived ?? 0)})
              </span>
            </span>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
