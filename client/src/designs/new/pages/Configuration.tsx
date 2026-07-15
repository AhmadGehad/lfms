import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { OwnerCapitalDialog } from "@/components/OwnerCapitalDialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cog, Trash2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EntityTable, type FieldSpec } from "../components/EntityTable";
import { StatusBadge } from "../components/StatusBadge";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";
import type { Column } from "../components/DataTable";

/**
 * New Configuration. Every reference entity through one EntityTable pattern with
 * inline field help on the consequential fields (gestationDays, isExitStatus,
 * autoStageWeightKg — F-CFG1), plus a Settings tab. Same config tRPC +
 * permissions as Old.
 */
export default function NewConfiguration() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canEdit = perms.can("configuration", "update");
  const canViewCapital = perms.can("capital", "view");
  const utils = trpc.useUtils();
  const ok = (msg: string, invalidate: () => void) => ({ onSuccess: () => { invalidate(); toast.success(msg); }, onError: (e: { message: string }) => toast.error(e.message) });
  const saved = t("config.saved", "Saved");

  // ── data ──
  const species = trpc.config.getSpecies.useQuery();
  const categories = trpc.config.getCategories.useQuery();
  const statuses = trpc.config.getStatuses.useQuery();
  const groups = trpc.config.getGroups.useQuery();
  const owners = trpc.config.getOwners.useQuery({});
  const birthTypes = trpc.config.getBirthTypes.useQuery();
  const feedItems = trpc.config.getFeedItems.useQuery();
  const expenseCats = trpc.config.getExpenseCategories.useQuery();
  const expenseSubCats = trpc.config.getExpenseSubCategories.useQuery();
  const vaccines = trpc.config.getVaccines.useQuery();
  const [deleteVaccineRow, setDeleteVaccineRow] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("species");
  const [capitalOwner, setCapitalOwner] = useState<any | null>(null);

  const speciesOpts = ((species.data as any[]) ?? []).map(s => ({ value: String(s.id), label: s.name }));
  const categoryOpts = ((categories.data as any[]) ?? []).map(c => ({ value: String(c.id), label: c.name }));
  const expenseCatOpts = ((expenseCats.data as any[]) ?? []).map(c => ({ value: String(c.id), label: c.name }));

  // ── mutations ──
  const m = {
    createSpecies: trpc.config.createSpecies.useMutation(ok(saved, () => utils.config.getSpecies.invalidate())),
    updateSpecies: trpc.config.updateSpecies.useMutation(ok(saved, () => utils.config.getSpecies.invalidate())),
    createCategory: trpc.config.createCategory.useMutation(ok(saved, () => utils.config.getCategories.invalidate())),
    updateCategory: trpc.config.updateCategory.useMutation(ok(saved, () => utils.config.getCategories.invalidate())),
    createStatus: trpc.config.createStatus.useMutation(ok(saved, () => utils.config.getStatuses.invalidate())),
    updateStatus: trpc.config.updateStatus.useMutation(ok(saved, () => utils.config.getStatuses.invalidate())),
    createGroup: trpc.config.createGroup.useMutation(ok(saved, () => utils.config.getGroups.invalidate())),
    updateGroup: trpc.config.updateGroup.useMutation(ok(saved, () => utils.config.getGroups.invalidate())),
    createOwner: trpc.config.createOwner.useMutation(ok(saved, () => utils.config.getOwners.invalidate())),
    updateOwner: trpc.config.updateOwner.useMutation(ok(saved, () => utils.config.getOwners.invalidate())),
    createBirthType: trpc.config.createBirthType.useMutation(ok(saved, () => utils.config.getBirthTypes.invalidate())),
    updateBirthType: trpc.config.updateBirthType.useMutation(ok(saved, () => utils.config.getBirthTypes.invalidate())),
    createFeedItem: trpc.config.createFeedItem.useMutation(ok(saved, () => utils.config.getFeedItems.invalidate())),
    updateFeedItem: trpc.config.updateFeedItem.useMutation(ok(saved, () => utils.config.getFeedItems.invalidate())),
    createExpenseCategory: trpc.config.createExpenseCategory.useMutation(ok(saved, () => utils.config.getExpenseCategories.invalidate())),
    updateExpenseCategory: trpc.config.updateExpenseCategory.useMutation(ok(saved, () => utils.config.getExpenseCategories.invalidate())),
    createExpenseSubCategory: trpc.config.createExpenseSubCategory.useMutation(ok(saved, () => utils.config.getExpenseSubCategories.invalidate())),
    updateExpenseSubCategory: trpc.config.updateExpenseSubCategory.useMutation(ok(saved, () => utils.config.getExpenseSubCategories.invalidate())),
    createVaccine: trpc.config.createVaccine.useMutation(ok(saved, () => utils.config.getVaccines.invalidate())),
    updateVaccine: trpc.config.updateVaccine.useMutation(ok(saved, () => utils.config.getVaccines.invalidate())),
    deleteVaccine: trpc.config.deleteVaccine.useMutation({
      onSuccess: () => { utils.config.getVaccines.invalidate(); toast.success(saved); setDeleteVaccineRow(null); },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  };

  const nameCol = (label: string): Column<any> => ({ id: "name", header: label, cell: (r: any) => <span className="font-medium">{r.name}</span>, sortValue: (r: any) => r.name, primary: true, mobileLabel: label });
  const activeCol: Column<any> = { id: "active", header: t("config.active", "Active"), cell: (r: any) => <StatusBadge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? t("config.active", "Active") : t("config.inactive", "Inactive")}</StatusBadge>, mobileLabel: t("config.active", "Active") };

  const configTabs = [
    { value: "species", label: t("config.species", "Species") },
    { value: "categories", label: t("config.categories", "Categories") },
    { value: "statuses", label: t("config.statuses", "Statuses") },
    { value: "groups", label: t("config.groups", "Groups") },
    { value: "owners", label: t("config.owners", "Owners") },
    { value: "birthTypes", label: t("config.birthTypes", "Birth types") },
    { value: "feedItems", label: t("config.feedItems", "Feed items") },
    { value: "expenseCats", label: t("config.expenseCategories", "Expense cats") },
    { value: "vaccines", label: t("config.vaccines", "Vaccines") },
    { value: "settings", label: t("config.settings", "Settings") },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={t("nav.configuration", "Configuration")} subtitle={t("config.subtitle", "Reference data & farm settings")} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="mb-3 sm:hidden">
          <label htmlFor="config-section" className="sr-only">{t("config.section", "Configuration section")}</label>
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger id="config-section" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {configTabs.map(tab => (
                <SelectItem key={tab.value} value={tab.value}>{tab.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TabsList className="hidden flex-wrap sm:flex">
          {configTabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="species" className="mt-4">
          <EntityTable
            title={t("config.species", "Species")} rows={(species.data as any[]) ?? []} loading={species.isLoading} canEdit={canEdit} storageKey="cfgSpecies" rowKey={r => r.id}
            columns={[nameCol(t("config.name", "Name")), { id: "gest", header: t("config.gestation", "Gestation (d)"), cell: (r: any) => r.gestationDays ?? "—", mobileLabel: t("config.gestation", "Gestation (d)") }, activeCol]}
            fields={[
              { key: "name", label: t("config.name", "Name"), type: "text", required: true },
              { key: "description", label: t("config.description", "Description"), type: "textarea" },
              { key: "gestationDays", label: t("config.gestation", "Gestation days"), type: "number", help: t("config.gestationHelp", "Average gestation length — used to compute pregnancy due dates.") },
            ]}
            onCreate={v => m.createSpecies.mutate(v as any)} onUpdate={(id, v) => m.updateSpecies.mutate({ id, ...v } as any)}
          />
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <EntityTable
            title={t("config.categories", "Category")} rows={(categories.data as any[]) ?? []} loading={categories.isLoading} canEdit={canEdit} storageKey="cfgCategories" rowKey={r => r.id}
            columns={[nameCol(t("config.name", "Name")), { id: "prefix", header: t("config.idPrefix", "Prefix"), cell: (r: any) => r.idPrefix, mobileLabel: t("config.idPrefix", "Prefix") }, { id: "target", header: t("config.targetWeight", "Target kg"), cell: (r: any) => r.targetWeightKg ?? "—", hideable: true, mobileLabel: t("config.targetWeight", "Target kg") }, { id: "ready", header: t("config.readyToSell", "Ready %"), cell: (r: any) => r.readyToSellThreshold ?? "80", mobileLabel: t("config.readyToSell", "Ready %") }, activeCol]}
            fields={[
              { key: "name", label: t("config.name", "Name"), type: "text", required: true },
              { key: "speciesId", label: t("animals.species", "Species"), type: "select", options: speciesOpts, required: true },
              { key: "idPrefix", label: t("config.idPrefix", "ID prefix"), type: "text", required: true, help: t("config.idPrefixHelp", "Prefix for auto-generated animal IDs in this category.") },
              { key: "targetWeightKg", label: t("config.targetWeight", "Target weight (kg)"), type: "number" },
              { key: "autoStageWeightKg", label: t("config.autoStage", "Auto-stage weight (kg)"), type: "number", help: t("config.autoStageHelp", "When an animal reaches this weight at weigh-in, it auto-moves to the target category.") },
              { key: "readyToSellThreshold", label: t("config.readyToSellThreshold", "Ready to Sell (%)"), type: "number", help: t("config.readyToSellHelp", "Percentage of target weight to mark animal as ready to sell (e.g., 80 = 80% of target).") },
            ]}
            onCreate={v => m.createCategory.mutate({ ...v, speciesId: Number(v.speciesId) } as any)} onUpdate={(id, v) => m.updateCategory.mutate({ id, ...v } as any)}
          />
        </TabsContent>

        <TabsContent value="statuses" className="mt-4">
          <EntityTable
            title={t("config.statuses", "Status")} rows={(statuses.data as any[]) ?? []} loading={statuses.isLoading} canEdit={canEdit} storageKey="cfgStatuses" rowKey={r => r.id}
            columns={[nameCol(t("config.name", "Name")), { id: "exit", header: t("config.exitStatus", "Exit"), cell: (r: any) => r.isExitStatus ? <StatusBadge tone="warning">{t("config.exit", "Exit")}</StatusBadge> : "—", mobileLabel: t("config.exitStatus", "Exit") }, activeCol]}
            fields={[
              { key: "name", label: t("config.name", "Name"), type: "text", required: true },
              { key: "description", label: t("config.description", "Description"), type: "textarea" },
              { key: "isExitStatus", label: t("config.exitStatus", "Exit status"), type: "checkbox", help: t("config.exitStatusHelp", "Animals in an exit status are treated as having left the farm (sold/dead) and excluded from active counts.") },
            ]}
            onCreate={v => m.createStatus.mutate(v as any)} onUpdate={(id, v) => m.updateStatus.mutate({ id, ...v } as any)}
          />
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          <EntityTable
            title={t("config.groups", "Group")} rows={(groups.data as any[]) ?? []} loading={groups.isLoading} canEdit={canEdit} storageKey="cfgGroups" rowKey={r => r.id}
            columns={[{ id: "code", header: t("config.code", "Code"), cell: (r: any) => <span className="font-medium">{r.groupCode}</span>, primary: true, mobileLabel: t("config.code", "Code") }, { id: "name", header: t("config.name", "Name"), cell: (r: any) => r.name, mobileLabel: t("config.name", "Name") }, activeCol]}
            fields={[
              { key: "groupCode", label: t("config.code", "Group code"), type: "text", required: true },
              { key: "name", label: t("config.name", "Name"), type: "text", required: true },
              { key: "speciesId", label: t("animals.species", "Species"), type: "select", options: speciesOpts },
              { key: "categoryId", label: t("animals.category", "Category"), type: "select", options: categoryOpts },
              { key: "description", label: t("config.description", "Description"), type: "textarea" },
            ]}
            onCreate={v => m.createGroup.mutate({ ...v, speciesId: v.speciesId ? Number(v.speciesId) : undefined, categoryId: v.categoryId ? Number(v.categoryId) : undefined } as any)} onUpdate={(id, v) => m.updateGroup.mutate({ id, ...v, speciesId: v.speciesId ? Number(v.speciesId) : undefined, categoryId: v.categoryId ? Number(v.categoryId) : undefined } as any)}
          />
        </TabsContent>

        <TabsContent value="owners" className="mt-4">
          <EntityTable
            title={t("config.owners", "Owner")} rows={(owners.data as any[]) ?? []} loading={owners.isLoading} canEdit={canEdit} storageKey="cfgOwners" rowKey={r => r.id}
            columns={[nameCol(t("config.name", "Name")), { id: "phone", header: t("owners.phone", "Phone"), cell: (r: any) => r.phone ?? "—", hideable: true, mobileLabel: t("owners.phone", "Phone") }, { id: "email", header: t("users.email", "Email"), cell: (r: any) => r.email ?? "—", hideable: true, mobileLabel: t("users.email", "Email") }, activeCol]}
            fields={[
              { key: "name", label: t("config.name", "Name"), type: "text", required: true },
              { key: "phone", label: t("owners.phone", "Phone"), type: "text" },
              { key: "email", label: t("users.email", "Email"), type: "text" },
            ]}
            onCreate={v => m.createOwner.mutate(v as any)} onUpdate={(id, v) => m.updateOwner.mutate({ id, ...v } as any)}
            extraRowActions={canViewCapital ? r => <button onClick={() => setCapitalOwner(r)} className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10" title="Capital & partners">Capital</button> : undefined}
          />
        </TabsContent>

        <TabsContent value="birthTypes" className="mt-4">
          <EntityTable
            title={t("config.birthTypes", "Birth type")} rows={(birthTypes.data as any[]) ?? []} loading={birthTypes.isLoading} canEdit={canEdit} storageKey="cfgBirthTypes" rowKey={r => r.id}
            columns={[nameCol(t("config.name", "Name")), activeCol]}
            fields={[{ key: "name", label: t("config.name", "Name"), type: "text", required: true }, { key: "description", label: t("config.description", "Description"), type: "textarea" }]}
            onCreate={v => m.createBirthType.mutate(v as any)} onUpdate={(id, v) => m.updateBirthType.mutate({ id, ...v } as any)}
          />
        </TabsContent>

        <TabsContent value="feedItems" className="mt-4">
          <EntityTable
            title={t("config.feedItems", "Feed item")} rows={(feedItems.data as any[]) ?? []} loading={feedItems.isLoading} canEdit={canEdit} storageKey="cfgFeedItems" rowKey={r => r.id}
            columns={[nameCol(t("config.name", "Name")), { id: "unit", header: t("config.unit", "Unit"), cell: (r: any) => r.unit, mobileLabel: t("config.unit", "Unit") }, activeCol]}
            fields={[{ key: "name", label: t("config.name", "Name"), type: "text", required: true }, { key: "unit", label: t("config.unit", "Unit"), type: "text", help: t("config.unitHelp", "e.g. kg, bale, bag") }]}
            onCreate={v => m.createFeedItem.mutate(v as any)} onUpdate={(id, v) => m.updateFeedItem.mutate({ id, ...v } as any)}
          />
        </TabsContent>

        <TabsContent value="expenseCats" className="mt-4 space-y-6">
          <EntityTable
            title={t("config.expenseCategories", "Expense category")} rows={(expenseCats.data as any[]) ?? []} loading={expenseCats.isLoading} canEdit={canEdit} storageKey="cfgExpenseCats" rowKey={r => r.id}
            columns={[nameCol(t("config.name", "Name")), activeCol]}
            fields={[{ key: "name", label: t("config.name", "Name"), type: "text", required: true }, { key: "description", label: t("config.description", "Description"), type: "textarea" }]}
            onCreate={v => m.createExpenseCategory.mutate(v as any)} onUpdate={(id, v) => m.updateExpenseCategory.mutate({ id, ...v } as any)}
          />
          <div>
            <h2 className="mb-2 text-sm font-semibold">{t("expenses.subCategories", "Sub-categories")}</h2>
            <EntityTable
              title={t("expenses.subCategory", "Sub-category")} rows={(expenseSubCats.data as any[]) ?? []} loading={expenseSubCats.isLoading} canEdit={canEdit} storageKey="cfgExpenseSubCats" rowKey={r => r.id}
              columns={[
                nameCol(t("config.name", "Name")),
                { id: "parent", header: t("expenses.category", "Category"), cell: (r: any) => ((expenseCats.data as any[]) ?? []).find(c => c.id === r.categoryId)?.name ?? r.categoryName ?? "—", sortValue: (r: any) => r.categoryId, mobileLabel: t("expenses.category", "Category") },
                { id: "desc", header: t("config.description", "Description"), cell: (r: any) => <span className="block max-w-52 truncate text-muted-foreground">{r.description ?? "—"}</span>, hideable: true, mobileLabel: t("config.description", "Description") },
                activeCol,
              ]}
              fields={[
                { key: "categoryId", label: t("expenses.category", "Category"), type: "select", options: expenseCatOpts, required: true },
                { key: "name", label: t("config.name", "Name"), type: "text", required: true },
                { key: "description", label: t("config.description", "Description"), type: "textarea", help: t("expenses.subCategoryDescHelp", "Shown as inline help when staff pick this sub-category on an expense.") },
              ]}
              onCreate={v => m.createExpenseSubCategory.mutate({ ...v, categoryId: Number(v.categoryId) } as any)}
              onUpdate={(id, v) => m.updateExpenseSubCategory.mutate({ id, ...v, categoryId: v.categoryId ? Number(v.categoryId) : undefined } as any)}
            />
          </div>
        </TabsContent>

        <TabsContent value="vaccines" className="mt-4">
          <EntityTable
            title={t("config.vaccines", "Vaccine")} rows={(vaccines.data as any[]) ?? []} loading={vaccines.isLoading} canEdit={canEdit} storageKey="cfgVaccines" rowKey={r => r.id}
            columns={[nameCol(t("config.name", "Name")), { id: "validity", header: t("config.validity", "Validity"), cell: (r: any) => `${r.validityPeriod} ${r.validityUnit}`, mobileLabel: t("config.validity", "Validity") }, activeCol]}
            fields={[
              { key: "name", label: t("config.name", "Name"), type: "text", required: true },
              { key: "validityPeriod", label: t("config.validityPeriod", "Validity period"), type: "number", required: true },
              { key: "validityUnit", label: t("config.validityUnit", "Unit"), type: "select", required: true, options: [{ value: "days", label: t("config.days", "Days") }, { value: "months", label: t("config.months", "Months") }] },
              { key: "boosterRequired", label: t("config.boosterRequired", "Booster required"), type: "checkbox" },
              { key: "boosterInterval", label: t("config.boosterInterval", "Booster interval (days)"), type: "number" },
              { key: "description", label: t("config.description", "Description"), type: "textarea" },
            ]}
            onCreate={v => m.createVaccine.mutate({ ...v, boosterRequired: Boolean(v.boosterRequired) } as any)} onUpdate={(id, v) => m.updateVaccine.mutate({ id, ...v } as any)}
            extraRowActions={r => (
              <button
                onClick={() => setDeleteVaccineRow(r)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
                aria-label={t("vaccine.deleteVaccine", "Delete vaccine")}
                title={t("vaccine.deleteVaccine", "Delete vaccine")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          />
          <ConsequenceConfirm
            open={deleteVaccineRow !== null}
            onOpenChange={o => !o && setDeleteVaccineRow(null)}
            title={t("vaccine.deleteVaccine", "Delete vaccine")}
            description={t("vaccine.deleteVaccineConfirm", "Delete {{name}}? This cannot be undone.", { name: deleteVaccineRow?.name ?? "" })}
            consequences={[{ text: t("vaccine.deleteVaccineHint", "Existing vaccination records keep their history, but the vaccine can no longer be applied."), tone: "warning" }]}
            confirmLabel={t("common.delete", "Delete")}
            cancelLabel={t("common.cancel", "Cancel")}
            destructive
            loading={m.deleteVaccine.isPending}
            onConfirm={() => deleteVaccineRow && m.deleteVaccine.mutate({ id: deleteVaccineRow.id })}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab canEdit={canEdit} />
        </TabsContent>
      </Tabs>
      <OwnerCapitalDialog owner={capitalOwner} open={capitalOwner !== null} onOpenChange={open => !open && setCapitalOwner(null)} />
    </div>
  );
}

function SettingsTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const { data } = trpc.config.getSettings.useQuery();
  const settings = Object.fromEntries(((data as any[]) ?? []).map(s => [s.settingKey, s.settingValue]));
  const [currency, setCurrency] = useState<string | null>(null);
  const [farmName, setFarmName] = useState<string | null>(null);
  const save = trpc.config.upsertSetting.useMutation({
    onSuccess: () => { utils.config.getSettings.invalidate(); utils.config.getDisplaySettings.invalidate(); toast.success(t("config.saved", "Saved")); },
    onError: e => toast.error(e.message),
  });

  const curVal = currency ?? settings.currency ?? "EGP";
  const farmVal = farmName ?? settings.farmName ?? "";

  return (
    <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
      <div className="space-y-1.5">
        <label htmlFor="config-currency" className="text-sm font-medium">{t("config.currency", "Currency")}</label>
        <Input id="config-currency" value={curVal} onChange={e => setCurrency(e.target.value)} disabled={!canEdit} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="config-farm-name" className="text-sm font-medium">{t("config.farmName", "Farm name")}</label>
        <Input id="config-farm-name" value={farmVal} onChange={e => setFarmName(e.target.value)} disabled={!canEdit} />
      </div>
      {canEdit && (
        <button
          onClick={() => {
            save.mutate({ key: "currency", value: curVal });
            save.mutate({ key: "farmName", value: farmVal });
          }}
          disabled={save.isPending}
          className="min-h-11 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:min-h-9"
        >
          {t("common.save", "Save")}
        </button>
      )}
    </div>
  );
}
