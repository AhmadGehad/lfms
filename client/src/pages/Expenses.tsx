import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { DollarSign, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/usePermissions";

function AddExpenseDialog({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    expenseDate: new Date().toISOString().split("T")[0],
    categoryId: "",
    subCategoryId: "",
    amount: "",
    targetType: "general",
    headId: "",
    categoryTarget: "",
    vendorName: "",
    notes: "",
  });

  const { data: categories } = trpc.config.getExpenseCategories.useQuery();
  const { data: subCategories } = trpc.config.getExpenseSubCategories.useQuery(
    { categoryId: form.categoryId ? Number(form.categoryId) : undefined }
  );
  const { data: animals } = trpc.animals.list.useQuery({ isActive: true });
  const { data: animalCategories } = trpc.config.getCategories.useQuery();
  const utils = trpc.useUtils();

  const createExpense = trpc.expenses.create.useMutation({
    onSuccess: () => {
      toast.success(t("expenses.recorded"));
      utils.expenses.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.animals.getAllPnL.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.categoryId || !form.amount) { toast.error(t("expenses.categoryAmountRequired")); return; }
    if (form.targetType === "head" && !form.headId) { toast.error(t("expenses.selectAnimalForHead")); return; }
    if (form.targetType === "category" && !form.categoryTarget) { toast.error(t("expenses.selectCategoryForCat")); return; }
    createExpense.mutate({
      expenseDate: form.expenseDate,
      categoryId: Number(form.categoryId),
      subCategoryId: form.subCategoryId ? Number(form.subCategoryId) : undefined,
      amount: form.amount,
      targetType: form.targetType as any,
      headId: form.headId ? Number(form.headId) : undefined,
      categoryTarget: form.categoryTarget ? Number(form.categoryTarget) : undefined,
      vendorName: form.vendorName || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />{t("expenses.addExpense")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("expenses.recordExpense")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (EGP) *</Label>
              <Input type="number" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v, subCategoryId: "" }))}>
                <SelectTrigger><SelectValue placeholder={t("common.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("expenses.subCategory")}</Label>
              <Select value={form.subCategoryId} onValueChange={(v) => setForm((f) => ({ ...f, subCategoryId: v }))} disabled={!form.categoryId}>
                <SelectTrigger><SelectValue placeholder={t("expenses.selectSubCategory")} /></SelectTrigger>
                <SelectContent>
                  {(subCategories ?? []).map((sc: any) => (
                    <SelectItem key={sc.id} value={String(sc.id)}>
                      {sc.name}{sc.description ? ` — ${sc.description}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                const sc = (subCategories ?? []).find((s: any) => String(s.id) === form.subCategoryId);
                return sc?.description
                  ? <p className="text-xs text-muted-foreground">{sc.description}</p>
                  : null;
              })()}
            </div>
            <div className="space-y-1.5">
              <Label>Allocation Type *</Label>
              <Select value={form.targetType} onValueChange={(v) => setForm((f) => ({ ...f, targetType: v, headId: "", categoryTarget: "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General (Farm-wide)</SelectItem>
                  <SelectItem value="herd">{t("expenses.herd")}</SelectItem>
                  <SelectItem value="category">Category (shared by group)</SelectItem>
                  <SelectItem value="head">{t("expenses.specificAnimal")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.targetType === "category" && (
              <div className="space-y-1.5">
                <Label>Animal Category *</Label>
                <Select value={form.categoryTarget} onValueChange={(v) => setForm((f) => ({ ...f, categoryTarget: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectCategory")} /></SelectTrigger>
                  <SelectContent>
                    {(animalCategories ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.targetType === "head" && (
              <div className="space-y-1.5">
                <Label>Animal *</Label>
                <Select value={form.headId} onValueChange={(v) => setForm((f) => ({ ...f, headId: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("expenses.selectAnimal")} /></SelectTrigger>
                  <SelectContent>
                    {(animals ?? []).map((a: any) => (
                      <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{t("expenses.vendorSupplier")}</Label>
            <Input placeholder={t("expenses.vendorName")} value={form.vendorName} onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input placeholder={t("common.optionalNotes")} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={createExpense.isPending}>
            {createExpense.isPending ? "Saving..." : "Save Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Expenses() {
  const { t } = useTranslation();
  const { canMutate } = usePermissions();
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [toDate] = useState(new Date().toISOString().split("T")[0]);
  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [filterVendor, setFilterVendor] = useState<string>("");
  const [filterTargetType, setFilterTargetType] = useState<string>("all");

  const { data: expenses, isLoading, refetch } = trpc.expenses.list.useQuery({
    fromDate,
    toDate,
    ownerId: filterOwner !== "all" ? Number(filterOwner) : undefined,
    vendor: filterVendor || undefined,
    targetType: filterTargetType !== "all" ? (filterTargetType as "general" | "category" | "head" | "herd") : undefined,
  });
  const { data: ownersList } = trpc.config.getOwners.useQuery({ activeOnly: true });
  const utils = trpc.useUtils();

  const deleteExpense = trpc.recycleBin.deleteExpense.useMutation({
    onSuccess: () => {
      toast.success(t("expenses.movedToBin"));
      utils.expenses.list.invalidate();
      utils.dashboard.getKPIs.invalidate();
      utils.animals.getAllPnL.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalAmount = (expenses ?? []).reduce((sum: number, e: any) => sum + parseFloat(String(e.expense.amount)), 0);

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            {t("expenses.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {(expenses ?? []).length} entries · Total: EGP {totalAmount.toLocaleString("en-EG", { minimumFractionDigits: 2 })}
          </p>
        </div>
        {canMutate && <AddExpenseDialog onSuccess={refetch} />}
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Label className="text-sm">{t("common.from")}:</Label>
              <Input type="date" className="w-36" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">{t("common.to")}:</Label>
              <Input type="date" className="w-36" value={toDate} readOnly />
            </div>
            <Select value={filterTargetType} onValueChange={setFilterTargetType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("expenses.allocation")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("expenses.allAllocations")}</SelectItem>
                <SelectItem value="general">{t("expenses.general")}</SelectItem>
                <SelectItem value="herd">{t("expenses.herd")}</SelectItem>
                <SelectItem value="category">{t("expenses.category")}</SelectItem>
                <SelectItem value="head">{t("expenses.head")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("owners.owner")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("owners.allOwners")}</SelectItem>
                {(ownersList ?? []).map((o: any) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder={t("expenses.searchVendor")}
              className="w-44"
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.category")}</TableHead>
                  <TableHead>{t("expenses.subCategory")}</TableHead>
                  <TableHead>Amount (EGP)</TableHead>
                  <TableHead>{t("expenses.allocation")}</TableHead>
                  <TableHead>{t("owners.owner")}</TableHead>
                  <TableHead>{t("expenses.vendor")}</TableHead>
                  <TableHead>{t("common.notes")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (expenses ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">{t("expenses.noExpensesPeriod")}</TableCell></TableRow>
                ) : (
                  (expenses ?? []).map((e: any) => (
                    <TableRow key={e.expense.id}>
                      <TableCell>{new Date(e.expense.expenseDate).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{e.categoryName}</TableCell>
                      <TableCell className="text-muted-foreground">{e.subCategoryName ?? "—"}</TableCell>
                      <TableCell className="font-semibold text-red-600">
                        {parseFloat(String(e.expense.amount)).toLocaleString("en-EG", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="capitalize text-sm">{e.expense.targetType}</TableCell>
                      <TableCell className="text-sm">{e.ownerName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-muted-foreground">{e.expense.vendorName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-32 truncate">{e.expense.notes ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                                {t("expenses.deleteExpense")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Move this <strong>EGP {parseFloat(String(e.expense.amount)).toLocaleString()}</strong> expense to the Recycle Bin? You can restore it anytime.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteExpense.mutate({ id: e.expense.id })}>
                                {t("common.moveToBin")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
