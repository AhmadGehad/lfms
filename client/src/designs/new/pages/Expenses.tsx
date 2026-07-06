import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCurrency } from "@/hooks/useCurrency";
import { useOwnerFilter } from "@/contexts/OwnerFilterContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DollarSign, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import { FormSection, FormField, FormFooter } from "../components/FormLayout";

function fmtDate(d: unknown) {
  if (!d) return "—";
  const x = new Date(d as string);
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleDateString();
}
const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};

type ExpenseForm = {
  expenseDate: string;
  categoryIds: string[];
  subCategoryId: string;
  amount: string;
  targetType: string;
  headId: string;
  categoryTarget: string;
  vendorName: string;
  notes: string;
};

const blankForm = (): ExpenseForm => ({
  expenseDate: today(),
  categoryIds: [],
  subCategoryId: "",
  amount: "",
  targetType: "general",
  headId: "",
  categoryTarget: "",
  vendorName: "",
  notes: "",
});

/**
 * Shared create/edit expense form on the FormLayout pattern. Full parity with
 * Old: allocation type (general/herd/category/head) with conditional animal or
 * animal-category pickers, plus sub-category description hints.
 */
function ExpenseFormFields({ form, setForm }: {
  form: ExpenseForm;
  setForm: React.Dispatch<React.SetStateAction<ExpenseForm>>;
}) {
  const { t } = useTranslation();
  const { data: categories } = trpc.config.getExpenseCategories.useQuery();
  // Sub-categories belong to a single parent, so the picker only applies when
  // exactly one category is selected.
  const soleCategoryId = form.categoryIds.length === 1 ? form.categoryIds[0] : "";
  const { data: subCategories } = trpc.config.getExpenseSubCategories.useQuery(
    { categoryId: Number(soleCategoryId) },
    { enabled: !!soleCategoryId }
  );
  const { data: animals } = trpc.animals.lookup.useQuery({ isActive: true }, { enabled: form.targetType === "head" });
  const { data: animalCategories } = trpc.config.getCategories.useQuery(undefined, { enabled: form.targetType === "category" });
  const selectedSub = ((subCategories as any[]) ?? []).find(s => String(s.id) === form.subCategoryId);

  return (
    <FormSection>
      <FormField label={t("expenses.date", "Date")} required>
        <Input type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
      </FormField>
      <FormField label={t("expenses.amount", "Amount")} required>
        <Input type="number" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
      </FormField>
      <FormField label={t("expenses.category", "Categories")} required>
        <div className="grid grid-cols-2 gap-3">
          {((categories as any[]) ?? []).map(c => (
            <label key={c.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.categoryIds.includes(String(c.id))}
                onChange={e => {
                  if (e.target.checked) {
                    setForm(f => ({ ...f, categoryIds: [...f.categoryIds, String(c.id)], subCategoryId: "" }));
                  } else {
                    setForm(f => ({ ...f, categoryIds: f.categoryIds.filter(id => id !== String(c.id)), subCategoryId: "" }));
                  }
                }}
                className="w-4 h-4"
              />
              <span className="text-sm">{c.name}</span>
            </label>
          ))}
        </div>
      </FormField>
      <FormField
        label={t("expenses.subCategory", "Sub-category")}
        hint={selectedSub?.description ?? (!soleCategoryId ? t("expenses.pickCategoryFirst", "Pick a category first") : undefined)}
      >
        <Select value={form.subCategoryId} onValueChange={v => setForm(f => ({ ...f, subCategoryId: v }))} disabled={!soleCategoryId}>
          <SelectTrigger><SelectValue placeholder={t("common.optional", "Optional")} /></SelectTrigger>
          <SelectContent>
            {((subCategories as any[]) ?? []).map(s => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.description ? ` — ${s.description}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label={t("expenses.allocation", "Allocation")} required>
        <Select value={form.targetType} onValueChange={v => setForm(f => ({ ...f, targetType: v, headId: "", categoryTarget: "" }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="general">{t("expenses.general", "General (Farm-wide)")}</SelectItem>
            <SelectItem value="herd">{t("expenses.herd", "Herd")}</SelectItem>
            <SelectItem value="category">{t("expenses.categoryAllocation", "Category (shared by group)")}</SelectItem>
            <SelectItem value="head">{t("expenses.specificAnimal", "Specific animal")}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      {form.targetType === "category" && (
        <FormField label={t("expenses.animalCategory", "Animal Category")} required>
          <Select value={form.categoryTarget} onValueChange={v => setForm(f => ({ ...f, categoryTarget: v }))}>
            <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
            <SelectContent>
              {((animalCategories as any[]) ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      )}
      {form.targetType === "head" && (
        <FormField label={t("animals.animalId", "Animal")} required>
          <Select value={form.headId} onValueChange={v => setForm(f => ({ ...f, headId: v }))}>
            <SelectTrigger><SelectValue placeholder={t("expenses.selectAnimal", "Select animal")} /></SelectTrigger>
            <SelectContent>
              {((animals as any[]) ?? []).map(a => (
                <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
      <FormField label={t("expenses.vendor", "Vendor")}>
        <Input value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} />
      </FormField>
      <FormField label={t("expenses.notes", "Notes")} full>
        <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
      </FormField>
    </FormSection>
  );
}

function validateExpenseForm(form: ExpenseForm, t: (k: string, d: string) => string): string | null {
  if (form.categoryIds.length === 0 || !(parseFloat(form.amount) > 0)) return t("expenses.fillRequired", "Enter at least one category and amount");
  if (form.targetType === "head" && !form.headId) return t("expenses.selectAnimalForHead", "Select an animal for a per-head expense");
  if (form.targetType === "category" && !form.categoryTarget) return t("expenses.selectCategoryForCat", "Select an animal category");
  return null;
}

const toPayload = (form: ExpenseForm) => ({
  expenseDate: form.expenseDate,
  categoryIds: form.categoryIds.map(Number),
  subCategoryId: form.subCategoryId ? Number(form.subCategoryId) : undefined,
  amount: form.amount,
  targetType: form.targetType as any,
  headId: form.headId ? Number(form.headId) : undefined,
  categoryTarget: form.categoryTarget ? Number(form.categoryTarget) : undefined,
  vendorName: form.vendorName || undefined,
  notes: form.notes || undefined,
});

/**
 * New Expenses (high-frequency Staff task). DataTable list + sectioned create,
 * edit, and delete-to-bin flows on the FormLayout/ConsequenceConfirm patterns.
 * Same tRPC mutations, filters, and permissions as Old.
 */
export default function NewExpenses() {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const { ownerParam } = useOwnerFilter();
  const perms = usePermissions();
  const canCreate = perms.can("expenses", "create");
  const canUpdate = perms.can("expenses", "update");
  const canDelete = perms.can("expenses", "delete");
  const utils = trpc.useUtils();
  const searchStr = useSearch();

  const [fromDate, setFromDate] = useState(monthAgo());
  const [toDate, setToDate] = useState(today());
  const [filterTargetType, setFilterTargetType] = useState("all");
  const [filterVendor, setFilterVendor] = useState("");

  const { data: expenses, isLoading } = trpc.expenses.list.useQuery({
    fromDate,
    toDate,
    ownerId: ownerParam,
    vendor: filterVendor || undefined,
    targetType: filterTargetType !== "all" ? (filterTargetType as any) : undefined,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ExpenseForm>(blankForm());
  const [editRow, setEditRow] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<ExpenseForm>(blankForm());
  const [deleteRow, setDeleteRow] = useState<any | null>(null);

  useEffect(() => {
    if (new URLSearchParams(searchStr).get("new") === "1" && canCreate) setOpen(true);
  }, [canCreate, searchStr]);

  const invalidate = () => {
    utils.expenses.list.invalidate();
    utils.dashboard.getKPIs.invalidate();
    utils.animals.getAllPnL.invalidate();
  };

  const reset = () => setForm(blankForm());
  const create = trpc.expenses.create.useMutation({
    onSuccess: () => { invalidate(); toast.success(t("expenses.created", "Expense added")); },
    onError: e => toast.error(e.message),
  });
  const update = trpc.expenses.update.useMutation({
    onSuccess: () => { invalidate(); toast.success(t("expenses.updated", "Expense updated")); setEditRow(null); },
    onError: e => toast.error(e.message),
  });
  const deleteExpense = trpc.recycleBin.deleteExpense.useMutation({
    onSuccess: () => { invalidate(); toast.success(t("expenses.movedToBin", "Expense moved to Recycle Bin")); setDeleteRow(null); },
    onError: e => toast.error(e.message),
  });

  const submit = (addAnother: boolean) => {
    const err = validateExpenseForm(form, t);
    if (err) { toast.error(err); return; }
    create.mutate(toPayload(form) as any, { onSuccess: () => (addAnother ? reset() : setOpen(false)) });
  };

  const startEdit = (r: any) => {
    setEditForm({
      expenseDate: new Date(r.expense.expenseDate).toISOString().slice(0, 10),
      categoryIds: r.expense.categoryIds ? r.expense.categoryIds.map(String) : [String(r.expense.categoryId)],
      subCategoryId: r.expense.subCategoryId ? String(r.expense.subCategoryId) : "",
      amount: String(r.expense.amount),
      targetType: r.expense.targetType ?? "general",
      headId: r.expense.headId ? String(r.expense.headId) : "",
      categoryTarget: r.expense.categoryTarget ? String(r.expense.categoryTarget) : "",
      vendorName: r.expense.vendorName ?? "",
      notes: r.expense.notes ?? "",
    });
    setEditRow(r);
  };
  const submitEdit = () => {
    if (!editRow) return;
    const err = validateExpenseForm(editForm, t);
    if (err) { toast.error(err); return; }
    update.mutate({ id: editRow.expense.id, ...toPayload(editForm) } as any);
  };

  const rows = (expenses as any[]) ?? [];
  const total = rows.reduce((s, r) => s + parseFloat(r.expense?.amount ?? 0), 0);

  const allocationLabel = (type: string) => {
    switch (type) {
      case "general": return t("expenses.general", "General");
      case "herd": return t("expenses.herd", "Herd");
      case "category": return t("expenses.category", "Category");
      case "head": return t("expenses.head", "Per-head");
      default: return type ?? "—";
    }
  };

  const columns: Column<any>[] = [
    { id: "date", header: t("expenses.date", "Date"), cell: r => fmtDate(r.expense?.expenseDate), sortValue: r => r.expense?.expenseDate, primary: true, mobileLabel: t("expenses.date", "Date") },
    { id: "category", header: t("expenses.category", "Category"), cell: r => r.categoryName ?? "—", sortValue: r => r.categoryName, mobileLabel: t("expenses.category", "Category") },
    { id: "sub", header: t("expenses.subCategory", "Sub-category"), cell: r => r.subCategoryName ?? "—", hideable: true, mobileLabel: t("expenses.subCategory", "Sub-category") },
    { id: "allocation", header: t("expenses.allocation", "Allocation"), cell: r => allocationLabel(r.expense?.targetType), sortValue: r => r.expense?.targetType, hideable: true, mobileLabel: t("expenses.allocation", "Allocation") },
    { id: "owner", header: t("owners.owner", "Owner"), cell: r => r.ownerName ?? "—", hideable: true, defaultHidden: true, mobileLabel: t("owners.owner", "Owner") },
    { id: "vendor", header: t("expenses.vendor", "Vendor"), cell: r => r.expense?.vendorName ?? "—", hideable: true, mobileLabel: t("expenses.vendor", "Vendor") },
    { id: "notes", header: t("expenses.notes", "Notes"), cell: r => <span className="block max-w-40 truncate text-muted-foreground">{r.expense?.notes ?? "—"}</span>, hideable: true, defaultHidden: true, mobileLabel: t("expenses.notes", "Notes") },
    { id: "amount", header: t("expenses.amount", "Amount"), cell: r => <span className="font-medium tabular-nums">{fmt(parseFloat(r.expense?.amount ?? 0))}</span>, sortValue: r => parseFloat(r.expense?.amount ?? 0), align: "end", mobileLabel: t("expenses.amount", "Amount") },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={t("nav.expenses", "Expenses")}
        subtitle={`${rows.length} ${t("expenses.entries", "entries")} · ${t("expenses.total", "Total")}: ${fmt(total)}`}
        crumbs={[{ label: t("nav.dashboard", "Dashboard"), href: "/" }, { label: t("nav.expenses", "Expenses") }]}
        actions={
          canCreate ? (
            <button onClick={() => { reset(); setOpen(true); }} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" />
              {t("expenses.add", "Add expense")}
            </button>
          ) : undefined
        }
      />

      <DataTable
        data={rows}
        columns={columns}
        rowKey={r => r.expense?.id}
        loading={isLoading}
        storageKey="expenses"
        toolbar={
          <>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {t("common.from", "From")}
              <Input type="date" className="h-9 w-36" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {t("common.to", "To")}
              <Input type="date" className="h-9 w-36" value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
            <Select value={filterTargetType} onValueChange={setFilterTargetType}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder={t("expenses.allocation", "Allocation")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("expenses.allAllocations", "All allocations")}</SelectItem>
                <SelectItem value="general">{t("expenses.general", "General")}</SelectItem>
                <SelectItem value="herd">{t("expenses.herd", "Herd")}</SelectItem>
                <SelectItem value="category">{t("expenses.category", "Category")}</SelectItem>
                <SelectItem value="head">{t("expenses.head", "Per-head")}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-9 w-44"
              placeholder={t("expenses.searchVendor", "Search vendor…")}
              aria-label={t("expenses.searchVendor", "Search vendor")}
              value={filterVendor}
              onChange={e => setFilterVendor(e.target.value)}
            />
          </>
        }
        rowActions={(canUpdate || canDelete) ? r => (
          <div className="flex items-center justify-end gap-1">
            {canUpdate && (
              <button
                onClick={() => startEdit(r)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
                aria-label={t("expenses.editExpense", "Edit expense")}
                title={t("expenses.editExpense", "Edit expense")}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setDeleteRow(r)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
                aria-label={t("expenses.deleteExpense", "Delete expense")}
                title={t("expenses.deleteExpense", "Delete expense")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : undefined}
        empty={<EmptyState icon={DollarSign} title={t("expenses.none", "No expenses yet")} />}
      />

      {/* Create */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("expenses.add", "Add expense")}</DialogTitle></DialogHeader>
          <ExpenseFormFields form={form} setForm={setForm} />
          <FormFooter>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button disabled={create.isPending} onClick={() => submit(true)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface disabled:opacity-50">{t("common.saveAddAnother", "Save & add another")}</button>
            <button disabled={create.isPending} onClick={() => submit(false)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{t("common.save", "Save")}</button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={editRow !== null} onOpenChange={o => !o && setEditRow(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("expenses.editExpense", "Edit expense")}</DialogTitle></DialogHeader>
          <ExpenseFormFields form={editForm} setForm={setEditForm} />
          <FormFooter>
            <button onClick={() => setEditRow(null)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button disabled={update.isPending} onClick={submitEdit} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {update.isPending ? t("common.saving", "Saving...") : t("common.save", "Save")}
            </button>
          </FormFooter>
        </DialogContent>
      </Dialog>

      {/* Delete to Recycle Bin */}
      <ConsequenceConfirm
        open={deleteRow !== null}
        onOpenChange={o => !o && setDeleteRow(null)}
        title={t("expenses.deleteExpense", "Delete expense")}
        description={t("expenses.deleteToBinDescription", "Move this expense to the Recycle Bin? You can restore it anytime.")}
        consequences={deleteRow ? [
          { text: `${fmt(parseFloat(deleteRow.expense?.amount ?? 0))} · ${deleteRow.categoryName ?? ""}`, tone: "warning" },
          { text: t("expenses.deleteRecalcHint", "Dashboard KPIs and animal P&L totals are recalculated."), tone: "info" },
        ] : []}
        confirmLabel={t("common.moveToBin", "Move to Bin")}
        cancelLabel={t("common.cancel", "Cancel")}
        destructive
        loading={deleteExpense.isPending}
        onConfirm={() => deleteRow && deleteExpense.mutate({ id: deleteRow.expense.id })}
      />
    </div>
  );
}
