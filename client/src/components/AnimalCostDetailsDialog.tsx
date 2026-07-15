import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/useCurrency";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "react-i18next";

type ExpenseTarget = "head" | "category" | "herd" | "general";

type ExpenseBreakdown = {
  categoryName: string;
  subCategoryName?: string | null;
  targetType: ExpenseTarget;
  amount: number;
};

export type AnimalCostDetails = {
  animalId: number;
  animalCode: string;
  purchaseCost?: number;
  feedCost?: number;
  directExpenseTotal?: number;
  categoryExpenseAllocation?: number;
  herdExpenseAllocation?: number;
  generalExpenseAllocation?: number;
  totalCost?: number;
  expenseBreakdown?: ExpenseBreakdown[];
};

export function AnimalCostDetailsDialog({
  animal,
  open,
  onOpenChange,
}: {
  animal: AnimalCostDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const { data: detailedCosts, isLoading } = trpc.animals.getPnL.useQuery(
    { animalId: animal?.animalId ?? 0 },
    { enabled: open && animal != null },
  );
  if (!animal) return null;

  const costs = detailedCosts ? { ...animal, ...detailedCosts } : animal;
  const expenses = Array.isArray(costs.expenseBreakdown) ? costs.expenseBreakdown : [];
  const listedExpenseTotal = expenses.reduce((total, item) => total + Number(item.amount ?? 0), 0);
  const allocatedExpenseTotal =
    Number(costs.directExpenseTotal ?? 0) +
    Number(costs.categoryExpenseAllocation ?? 0) +
    Number(costs.herdExpenseAllocation ?? 0) +
    Number(costs.generalExpenseAllocation ?? 0);
  const unitemisedExpense = Math.max(0, allocatedExpenseTotal - listedExpenseTotal);
  const allocationLabel: Record<ExpenseTarget, string> = {
    head: t("pnl.directAllocation", "Direct"),
    category: t("pnl.categoryAllocation", "Category share"),
    herd: t("pnl.herdAllocation", "Animal-wide share"),
    general: t("pnl.generalAllocation", "Farm share"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 pb-4 pt-5 sm:px-6">
          <DialogTitle>{t("pnl.costDetailsTitle", "Cost details · {{animal}}", { animal: animal.animalCode })}</DialogTitle>
          <DialogDescription>{t("pnl.costDetailsDescription", "Every cost currently assigned to this animal.")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6">
          <dl className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
            <CostSummary label={t("pnl.purchaseCost", "Purchase cost")} value={fmt(Number(costs.purchaseCost ?? 0))} />
            <CostSummary label={t("pnl.feedCost", "Feed cost")} value={fmt(Number(costs.feedCost ?? 0))} />
            <CostSummary label={t("pnl.expenseAllocations", "Expense allocations")} value={fmt(allocatedExpenseTotal)} />
            <CostSummary label={t("pnl.totalCost", "Total cost")} value={fmt(Number(costs.totalCost ?? 0))} emphasis />
          </dl>

          <section aria-labelledby="animal-expense-breakdown">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 id="animal-expense-breakdown" className="text-sm font-semibold">
                {t("pnl.expenseBreakdown", "Expense breakdown")}
              </h3>
              <span className="text-sm font-semibold tabular-nums">{fmt(allocatedExpenseTotal)}</span>
            </div>
            {isLoading ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-4/5" />
              </div>
            ) : expenses.length > 0 ? (
              <ul className="overflow-hidden rounded-lg border border-border divide-y divide-border">
                {expenses.map((expense, index) => (
                  <li key={`${expense.targetType}-${expense.categoryName}-${expense.subCategoryName ?? ""}-${index}`} className="flex items-center justify-between gap-3 bg-card px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{expense.categoryName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {expense.subCategoryName && <span className="text-xs text-muted-foreground">{expense.subCategoryName}</span>}
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
                          {allocationLabel[expense.targetType]}
                        </Badge>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{fmt(Number(expense.amount ?? 0))}</span>
                  </li>
                ))}
                {unitemisedExpense > 0.004 && (
                  <li className="flex items-center justify-between gap-3 bg-card px-3 py-2.5">
                    <span className="text-sm text-muted-foreground">{t("pnl.otherExpenses", "Other expenses")}</span>
                    <span className="text-sm font-semibold tabular-nums">{fmt(unitemisedExpense)}</span>
                  </li>
                )}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                {t("pnl.noAllocatedExpenses", "No expenses are assigned to this animal yet.")}
              </p>
            )}
          </section>

          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {t("pnl.allocationHelp", "Direct expenses are charged in full. Category and animal-wide bills are split between animals alive when the expense was recorded.")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CostSummary({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-sm tabular-nums ${emphasis ? "font-bold text-foreground" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
