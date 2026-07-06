import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormField, FormSection } from "./FormLayout";

const today = () => new Date().toISOString().slice(0, 10);

export type ExpenseForm = {
  expenseDate: string;
  categoryId: string;
  subCategoryId: string;
  amount: string;
  targetType: string;
  headId: string;
  categoryTargets: string[];
  splitMode: string;
  vendorName: string;
  notes: string;
};

export const blankExpenseForm = (): ExpenseForm => ({
  expenseDate: today(),
  categoryId: "",
  subCategoryId: "",
  amount: "",
  targetType: "general",
  headId: "",
  categoryTargets: [],
  splitMode: "headcount",
  vendorName: "",
  notes: "",
});

/**
 * Shared create/edit expense form on the FormLayout pattern. Full parity with
 * Old: allocation type (general/herd/category/head) with conditional animal or
 * animal-category pickers, plus sub-category description hints. Used by the
 * Expenses page and the dashboard/QuickAdd expense dialog.
 */
export function ExpenseFormFields({ form, setForm, mode = "create" }: {
  form: ExpenseForm;
  setForm: React.Dispatch<React.SetStateAction<ExpenseForm>>;
  mode?: "create" | "edit";
}) {
  const { t } = useTranslation();
  const { data: categories } = trpc.config.getExpenseCategories.useQuery();
  const { data: subCategories } = trpc.config.getExpenseSubCategories.useQuery(
    { categoryId: Number(form.categoryId) },
    { enabled: !!form.categoryId }
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
      <FormField label={t("expenses.category", "Category")} required>
        <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v, subCategoryId: "" }))}>
          <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
          <SelectContent>
            {((categories as any[]) ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>
      <FormField
        label={t("expenses.subCategory", "Sub-category")}
        hint={selectedSub?.description ?? (!form.categoryId ? t("expenses.pickCategoryFirst", "Pick a category first") : undefined)}
      >
        <Select value={form.subCategoryId} onValueChange={v => setForm(f => ({ ...f, subCategoryId: v }))} disabled={!form.categoryId}>
          <SelectTrigger><SelectValue placeholder={t("common.optional", "Optional")} /></SelectTrigger>
          <SelectContent>
            {((subCategories as any[]) ?? []).map(s => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.description ? ` — ${s.description}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label={t("expenses.allocation", "Allocation")} required>
        <Select value={form.targetType} onValueChange={v => setForm(f => ({ ...f, targetType: v, headId: "", categoryTargets: [] }))}>
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
        <FormField
          label={t("expenses.animalCategories", "Animal categories")}
          hint={mode === "edit" ? t("expenses.editSingleTarget", "Editing affects one expense row — select exactly one category") : undefined}
          required
        >
          <div className="grid grid-cols-2 gap-3">
            {((animalCategories as any[]) ?? []).map(c => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.categoryTargets.includes(String(c.id))}
                  onChange={e => setForm(f => ({
                    ...f,
                    categoryTargets: e.target.checked
                      ? [...f.categoryTargets, String(c.id)]
                      : f.categoryTargets.filter(id => id !== String(c.id)),
                  }))}
                  className="w-4 h-4"
                />
                <span className="text-sm">{c.name}</span>
              </label>
            ))}
          </div>
        </FormField>
      )}
      {mode === "create" && form.targetType === "category" && form.categoryTargets.length >= 2 && (
        <FormField label={t("expenses.splitMode", "Split across categories")} hint={t("expenses.splitHint", "One expense row is created per category.")}>
          <div className="flex flex-col gap-2">
            {([["headcount", t("expenses.splitByHeadcount", "By head count")], ["equal", t("expenses.splitEqual", "Equal per category")]] as const).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="expense-split-mode"
                  checked={form.splitMode === value}
                  onChange={() => setForm(f => ({ ...f, splitMode: value }))}
                  className="w-4 h-4"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
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

export function validateExpenseForm(form: ExpenseForm, t: (k: string, d: string) => string, mode: "create" | "edit" = "create"): string | null {
  if (!form.categoryId || !(parseFloat(form.amount) > 0)) return t("expenses.fillRequired", "Enter category and amount");
  if (form.targetType === "head" && !form.headId) return t("expenses.selectAnimalForHead", "Select an animal for a per-head expense");
  if (form.targetType === "category" && form.categoryTargets.length === 0) return t("expenses.selectCategoryForCat", "Select an animal category");
  if (mode === "edit" && form.targetType === "category" && form.categoryTargets.length > 1) {
    return t("expenses.editSingleTarget", "Editing affects one expense row — select exactly one category");
  }
  return null;
}

export const expenseFormToPayload = (form: ExpenseForm, mode: "create" | "edit" = "create") => ({
  expenseDate: form.expenseDate,
  categoryId: Number(form.categoryId),
  subCategoryId: form.subCategoryId ? Number(form.subCategoryId) : undefined,
  amount: form.amount,
  targetType: form.targetType as any,
  headId: form.headId ? Number(form.headId) : undefined,
  // Create supports multi-target splitting; update stays single-row.
  ...(mode === "create"
    ? {
        categoryTargets: form.targetType === "category" && form.categoryTargets.length > 0 ? form.categoryTargets.map(Number) : undefined,
        splitMode: form.splitMode,
      }
    : {
        categoryTarget: form.targetType === "category" && form.categoryTargets[0] ? Number(form.categoryTargets[0]) : undefined,
      }),
  vendorName: form.vendorName || undefined,
  notes: form.notes || undefined,
});
