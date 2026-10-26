import type { TFunction } from "i18next";

/**
 * Plain-language wording for audit rows. Raw rows carry machine names
 * (`vaccinationRecord`, `update`, `statusId`); people should read
 * "Vaccination EW-0142 updated" and "Status".
 */

/** `vaccinationRecord` / `vaccination_record` → `vaccinationrecord` (the i18n key). */
const entityKey = (entityType: string) => entityType.replace(/[_\s-]/g, "").toLowerCase();

/** `weightLog` / `lambing_log` / `statusId` → `Weight log` / `Lambing log` / `Status`. */
export function humanizeIdentifier(name: string): string {
  const words = name
    .replace(/Id$/, "")
    .replace(/_id$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

export function auditEntityLabel(t: TFunction, entityType: string): string {
  return t(`audit.entityName.${entityKey(entityType)}`, { defaultValue: humanizeIdentifier(entityType) });
}

const ACTION_FALLBACK: Record<string, string> = {
  create: "added",
  insert: "added",
  create_animal: "added",
  update: "updated",
  tx: "updated",
  bulk_update: "updated in bulk",
  auto_stage: "moved to its next stage",
  delete: "deleted",
  soft_delete: "moved to the recycle bin",
  purge: "permanently deleted",
  revert: "reverted",
  restore: "restored",
  promote: "added to herd",
  exit: "removed from herd",
  import: "imported",
  view: "viewed",
  login: "signed in",
  update_name: "renamed",
  upload_logo: "logo uploaded",
  remove_logo: "logo removed",
  upload_favicon: "icon uploaded",
  remove_favicon: "icon removed",
};

export function auditActionLabel(t: TFunction, action: string): string {
  // Rows use mixed casing ("SOFT_DELETE", "RESTORE"); unknown actions still read as words.
  const key = action.toLowerCase();
  return t(`audit.actionVerb.${key}`, { defaultValue: ACTION_FALLBACK[key] ?? humanizeIdentifier(key).toLowerCase() });
}

/** "Animal EW-0142 updated", "Sale #11 added", "Settings updated". */
export function auditSentence(t: TFunction, row: { action: string; entityType: string; entityId?: string | number | null }): string {
  const id = row.entityId == null || row.entityId === "" ? "" : String(row.entityId);
  const ref = id ? (/^\d+$/.test(id) ? `#${id}` : id) : "";
  return t("audit.sentence", {
    entity: auditEntityLabel(t, row.entityType),
    ref,
    action: auditActionLabel(t, row.action),
    defaultValue: "{{entity}} {{ref}} {{action}}",
  }).replace(/\s+/g, " ").trim();
}

export function auditFieldLabel(t: TFunction, field: string): string {
  return t(`audit.fieldName.${field}`, { defaultValue: humanizeIdentifier(field) });
}
