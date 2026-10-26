import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import type { PermissionPage } from "@shared/permissions";
import {
  Activity, BarChart3, BookOpen, Cog, Database, DollarSign, Egg, FileText,
  Leaf, MapPinned, Plus, Scale, ShoppingCart, Syringe, Trash2, TrendingUp, UserRound, Users, Wheat,
} from "lucide-react";
import { fmtDate } from "../lib/format";

interface Target {
  label: string;
  icon: typeof Leaf;
  path: string;
  page: PermissionPage;
}

/**
 * Global search / command palette (⌘K) using the unused `command` primitive
 * (F-NAV/IA6). Jump to any permitted page or fire a quick action from anywhere —
 * the keyboard-first entry point the redesign requires. Animals are searchable
 * by tag ID, and sales by buyer or animal; lists load only while the palette is open.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const perms = usePermissions();
  const [query, setQuery] = useState("");
  const canSeeAnimals = perms.can("animals", "view");
  const { data: animals } = trpc.animals.list.useQuery({}, { enabled: open && canSeeAnimals });
  const canSeeSales = perms.can("sales", "view");
  const { data: sales } = trpc.sales.list.useQuery({}, { enabled: open && canSeeSales });
  const searching = query.trim() !== "";
  const saleRows = (sales as any[] | undefined) ?? [];
  const buyers = Array.from(new Set(saleRows.map(r => r.sale?.buyerName?.trim()).filter(Boolean))) as string[];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const nav = ([
    { label: t("nav.dashboard"), icon: BarChart3, path: "/", page: "dashboard" },
    { label: t("nav.animals"), icon: Leaf, path: "/animals", page: "animals" },
    { label: t("nav.breedingPregnancy", "Breeding & Pregnancy"), icon: Egg, path: "/breeding", page: "breeding" },
    { label: t("nav.feed"), icon: Wheat, path: "/feed", page: "feed" },
    { label: t("vaccine.title"), icon: Syringe, path: "/vaccinations", page: "vaccinations" },
    { label: t("nav.fattening", "Fattening"), icon: TrendingUp, path: "/fattening", page: "fattening" },
    { label: t("nav.farmMap"), icon: MapPinned, path: "/farm-map", page: "farmMap" },
    { label: t("nav.expenses"), icon: DollarSign, path: "/expenses", page: "expenses" },
    { label: t("nav.sales"), icon: ShoppingCart, path: "/sales", page: "sales" },
    { label: t("nav.pnl"), icon: Activity, path: "/pnl", page: "pnl" },
    { label: t("nav.incomeStatement"), icon: FileText, path: "/income-statement", page: "incomeStatement" },
    { label: t("nav.auditLog"), icon: BookOpen, path: "/audit", page: "audit" },
    { label: t("nav.users"), icon: Users, path: "/users", page: "users" },
    { label: t("nav.configuration"), icon: Cog, path: "/config", page: "configuration" },
    { label: t("nav.dataManagement"), icon: Database, path: "/data", page: "data" },
    { label: t("nav.recycleBin", "Recycle Bin"), icon: Trash2, path: "/recycle-bin", page: "recycleBin" },
  ] as Target[]).filter(n => perms.can(n.page, "view"));

  const quick = ([
    { label: t("animals.addAnimal", "Add animal"), icon: Plus, path: "/animals?new=1", page: "animals" },
    { label: t("weight.record", "Record weight"), icon: Scale, path: "/animals?weigh=1", page: "animals" },
    { label: t("sales.record", "Record sale"), icon: ShoppingCart, path: "/sales?new=1", page: "sales" },
    { label: t("expenses.add", "Add expense"), icon: DollarSign, path: "/expenses?new=1", page: "expenses" },
    { label: t("vaccine.record", "Record vaccination"), icon: Syringe, path: "/vaccinations?new=1", page: "vaccinations" },
    { label: t("breeding.recordBirth", "Record birth"), icon: Egg, path: "/breeding?new=1", page: "breeding" },
    { label: t("feed.addStock", "Add feed stock"), icon: Wheat, path: "/feed?new=1", page: "feed" },
  ] as { label: string; icon: typeof Plus; path: string; page: PermissionPage }[]).filter(q => perms.can(q.page, "create"));

  const go = (path: string) => { onOpenChange(false); setQuery(""); setLocation(path); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={query} onValueChange={setQuery} aria-label={t("search.placeholder", "Search")} placeholder={t("search.placeholder", "Search…")} />
      <CommandList>
        <CommandEmpty>{t("search.empty", "No results.")}</CommandEmpty>
        {quick.length > 0 && (
          <>
            <CommandGroup heading={t("actions.quickAdd", "Quick add")}>
              {quick.map(q => (
                <CommandItem key={q.path} value={`add ${q.label}`} onSelect={() => go(q.path)}>
                  <q.icon className="me-2 h-4 w-4" />
                  {q.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {searching && canSeeAnimals && animals && animals.length > 0 && (
          <>
            <CommandGroup heading={t("nav.animals")}>
              {animals.map((a: any) => (
                <CommandItem
                  key={a.animal?.id}
                  value={`${a.animal?.animalId ?? ""} ${a.categoryName ?? ""}`}
                  onSelect={() => go(`/animals/${a.animal?.id}`)}
                >
                  <Leaf className="me-2 h-4 w-4" />
                  <span className="font-medium">{a.animal?.animalId}</span>
                  <span className="ms-2 truncate text-xs text-muted-foreground">{[a.categoryName, a.statusName].filter(Boolean).join(" · ")}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {searching && buyers.length > 0 && (
          <>
            <CommandGroup heading={t("sales.buyers", "Buyers")}>
              {buyers.map(b => (
                <CommandItem key={b} value={`buyer ${b}`} onSelect={() => go(`/sales?buyer=${encodeURIComponent(b)}`)}>
                  <UserRound className="me-2 h-4 w-4" />
                  {b}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {searching && saleRows.length > 0 && (
          <>
            <CommandGroup heading={t("nav.sales")}>
              {saleRows.map(r => (
                <CommandItem
                  key={r.sale?.id}
                  value={`sale ${r.sale?.id} ${r.animalCode ?? ""} ${r.sale?.buyerName ?? ""}`}
                  onSelect={() => go(r.sale?.animalId ? `/animals/${r.sale.animalId}` : "/sales")}
                >
                  <ShoppingCart className="me-2 h-4 w-4" />
                  <span className="font-medium">{r.animalCode ?? `#${r.sale?.id}`}</span>
                  <span className="ms-2 truncate text-xs text-muted-foreground">{[r.sale?.buyerName, fmtDate(r.sale?.saleDate)].filter(Boolean).join(" · ")}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading={t("search.pages", "Pages")}>
          {nav.map(n => (
            <CommandItem key={n.path} value={n.label} onSelect={() => go(n.path)}>
              <n.icon className="me-2 h-4 w-4" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
