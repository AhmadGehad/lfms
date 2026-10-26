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
  update: "updated",
  delete: "deleted",
  revert: "reverted",
  restore: "restored",
};

export function auditActionLabel(t: TFunction, action: string): string {
  return t(`audit.actionVerb.${action}`, { defaultValue: ACTION_FALLBACK[action] ?? action });
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
