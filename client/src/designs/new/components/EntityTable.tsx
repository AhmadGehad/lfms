import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Plus } from "lucide-react";
import { DataTable, type Column } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { FormSection, FormField, FormFooter } from "./FormLayout";

export type FieldType = "text" | "number" | "textarea" | "checkbox" | "select";
export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
  /** Hide this field in edit mode (e.g. immutable keys). */
  createOnly?: boolean;
}

interface EntityTableProps<T> {
  title: React.ReactNode;
  rows: T[];
  loading?: boolean;
  columns: Column<T>[];
  fields: FieldSpec[];
  rowKey: (r: T) => string | number;
  canEdit?: boolean;
  storageKey: string;
  onCreate: (values: Record<string, any>) => void;
  onUpdate: (id: number, values: Record<string, any>) => void;
  /** Build the initial form values from a row for editing. */
  toForm?: (r: T) => Record<string, any>;
  /** Extra per-row actions rendered after the edit button (e.g. delete). */
  extraRowActions?: (r: T) => React.ReactNode;
}

function coerce(fields: FieldSpec[], form: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) {
    const v = form[f.key];
    if (f.type === "checkbox") out[f.key] = Boolean(v);
    else if (f.type === "number") out[f.key] = v === "" || v == null ? undefined : Number(v);
    else out[f.key] = v === "" ? undefined : v;
  }
  return out;
}

/**
 * Generic reference-data editor: a DataTable plus a spec-driven create/edit
 * dialog (FormLayout). One component drives every Configuration entity, with
 * inline field help (F-CFG1). Parent wires the entity's tRPC mutations.
 */
export function EntityTable<T>({
  title, rows, loading, columns, fields, rowKey, canEdit, storageKey, onCreate, onUpdate, toForm, extraRowActions,
}: EntityTableProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const startCreate = () => {
    const blank: Record<string, any> = {};
    for (const f of fields) blank[f.key] = f.type === "checkbox" ? false : "";
    setForm(blank); setEditId(null); setOpen(true);
  };
  const startEdit = (row: T) => {
    if (toForm) {
      setForm(toForm(row));
    } else {
      const f: Record<string, any> = {};
      for (const spec of fields) {
        const v = (row as any)[spec.key];
        f[spec.key] = spec.type === "checkbox" ? Boolean(v) : v == null ? "" : String(v);
      }
      setForm(f);
    }
    setEditId((row as any).id); setOpen(true);
  };
  const submit = () => {
    const values = coerce(fields, form);
    if (editId != null) onUpdate(editId, values);
    else onCreate(values);
    setOpen(false);
  };

  return (
    <div>
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <button onClick={startCreate} className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 sm:min-h-9">
            <Plus className="h-4 w-4" />{t("common.add", "Add")}
          </button>
        </div>
      )}
      <DataTable
        data={rows}
        columns={columns}
        rowKey={rowKey}
        loading={loading}
        storageKey={storageKey}
        rowActions={canEdit || extraRowActions ? r => (
          <div className="flex items-center justify-end gap-1">
            {canEdit && <button onClick={() => startEdit(r)} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface" aria-label={t("common.edit", "Edit")} title={t("common.edit", "Edit")}>
              <Pencil className="h-4 w-4" />
            </button>}
            {extraRowActions?.(r)}
          </div>
        ) : undefined}
        empty={<EmptyState title={t("common.noneYet", "Nothing here yet")} />}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId != null ? t("common.edit", "Edit") : t("common.add", "Add")} {title}</DialogTitle></DialogHeader>
          <FormSection>
            {fields.filter(f => !(f.createOnly && editId != null)).map(f => (
              <FormField key={f.key} label={f.label} required={f.required} hint={f.help} full={f.type === "textarea"}>
                {f.type === "textarea" ? (
                  <Textarea rows={2} value={form[f.key] ?? ""} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} />
                ) : f.type === "checkbox" ? (
                  <div className="flex h-9 items-center"><Switch checked={Boolean(form[f.key])} onCheckedChange={v => setForm(s => ({ ...s, [f.key]: v }))} /></div>
                ) : f.type === "select" ? (
                  <Select value={form[f.key] ?? ""} onValueChange={v => setForm(s => ({ ...s, [f.key]: v }))}>
                    <SelectTrigger><SelectValue placeholder={t("common.select", "Select")} /></SelectTrigger>
                    <SelectContent>{(f.options ?? []).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input type={f.type === "number" ? "number" : "text"} value={form[f.key] ?? ""} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} />
                )}
              </FormField>
            ))}
          </FormSection>
          <FormFooter>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">{t("common.cancel", "Cancel")}</button>
            <button onClick={submit} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">{t("common.save", "Save")}</button>
          </FormFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
