import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Standard page header for the New design: title, optional subtitle,
 * breadcrumbs (adopts the unused ui/breadcrumb pattern, F-NAV), and an actions
 * slot. RTL-safe via logical layout.
 */
export function PageHeader({
  title,
  subtitle,
  crumbs,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className={`h-3 w-3 ${isAr ? "rotate-180" : ""}`} />}
                {c.href ? (
                  <Link href={c.href} className="hover:text-foreground">{c.label}</Link>
                ) : (
                  <span className="text-foreground">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
