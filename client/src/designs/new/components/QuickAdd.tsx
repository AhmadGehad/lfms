import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/usePermissions";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { trpc } from "@/lib/trpc";
import type { PermissionPage } from "@shared/permissions";
import { DollarSign, Plus, Scale, ShoppingCart, Leaf } from "lucide-react";
import { AnimalCreateDialog, BulkRecordSaleDialog, QuickExpenseDialog, WeighInSessionDialog } from "./AnimalWorkflows";

interface QuickAction {
  id: string;
  label: string;
  icon: typeof Plus;
  page: PermissionPage;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * Global Quick Add (＋) reachable from anywhere (brief: required quick actions).
 * Optimised for the high-frequency Staff workflows. Each item is permission
 * gated and opens the workflow in-place so users do not lose their context.
 */
export function QuickAdd({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const perms = usePermissions();
  const { ownerParam } = useOwnerFilter();
  const [weighOpen, setWeighOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [animalOpen, setAnimalOpen] = useState(false);
  const needsAnimals = perms.can("fattening", "create") || perms.can("sales", "create");
  const { data: animals } = trpc.animals.list.useQuery(
    { isActive: true, ownerId: ownerParam },
    { enabled: needsAnimals && perms.can("animals", "view") }
  );
  const activeAnimals = useMemo(() => ((animals as any[]) ?? []).filter(a => a?.animal?.id), [animals]);

  const actions = ([
    { id: "weight", label: t("weight.record", "Record weight"), icon: Scale, page: "fattening", onSelect: () => setWeighOpen(true), disabled: activeAnimals.length === 0 },
    { id: "expense", label: t("expenses.add", "Add expense"), icon: DollarSign, page: "expenses", onSelect: () => setExpenseOpen(true) },
    { id: "sale", label: t("sales.record", "Record sale"), icon: ShoppingCart, page: "sales", onSelect: () => setSaleOpen(true), disabled: activeAnimals.length === 0 },
    { id: "animal", label: t("animals.addAnimal", "Add animal"), icon: Leaf, page: "animals", onSelect: () => setAnimalOpen(true) },
  ] as QuickAction[]).filter(a => perms.can(a.page, "create"));

  if (actions.length === 0) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring ${className}`}
            aria-label={t("actions.quickAdd", "Add")}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden md:inline">{t("actions.quickAdd", "Add")}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {actions.map(a => (
            <DropdownMenuItem
              key={a.id}
              disabled={a.disabled}
              onSelect={a.onSelect}
              className="cursor-pointer gap-2 disabled:cursor-not-allowed"
            >
              <a.icon className="h-4 w-4" />
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <WeighInSessionDialog open={weighOpen} onOpenChange={setWeighOpen} animals={activeAnimals} />
      <BulkRecordSaleDialog open={saleOpen} onOpenChange={setSaleOpen} animals={activeAnimals} />
      <QuickExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
      <AnimalCreateDialog open={animalOpen} onOpenChange={setAnimalOpen} />
    </>
  );
}
