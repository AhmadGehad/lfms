export type FeatureDetail = { name: string; description: string };

const FEATURE_DETAILS: Record<string, FeatureDetail> = {
  core: {
    name: "Core operations",
    description: "Farm workspace, dashboard, and shared operational records.",
  },
  animals: {
    name: "Animal management",
    description:
      "Animal registry, profiles, status history, ownership, and weight records.",
  },
  breeding: {
    name: "Breeding",
    description:
      "Mating, birth records, lineage, and newborn promotion workflows.",
  },
  pregnancy: {
    name: "Pregnancy",
    description: "Pregnancy tracking, expected dates, and follow-up records.",
  },
  fattening: {
    name: "Fattening",
    description:
      "Weight-progress and readiness tracking for animals prepared for sale.",
  },
  feed: {
    name: "Feed management",
    description:
      "Feed items, ration plans, stock movements, and consumption visibility.",
  },
  vaccinations: {
    name: "Vaccinations",
    description:
      "Vaccine schedules, dose history, boosters, and due-date alerts.",
  },
  expenses: {
    name: "Expenses",
    description: "Expense categories, farm costs, and cost-entry workflows.",
  },
  reporting: {
    name: "Reporting",
    description:
      "Profit and loss, income statements, and operational reporting.",
  },
  sales: {
    name: "Sales",
    description: "Sale records, sale value, and animal exit tracking.",
  },
  notifications: {
    name: "Notifications",
    description: "In-app operational alerts and user notification history.",
  },
  audit: {
    name: "Audit trail",
    description: "Tenant activity history and accountable operational changes.",
  },
  user_management: {
    name: "User management",
    description: "Tenant users, roles, permissions, and farm-level access.",
  },
  configuration: {
    name: "Configuration",
    description:
      "Species, categories, groups, statuses, and other farm master data.",
  },
  farm_map: {
    name: "Farm map",
    description: "Farm layout and animal location visibility.",
  },
  data_transfer: {
    name: "Data transfer",
    description: "Controlled import and export of tenant operational data.",
  },
  data_recovery: {
    name: "Data recovery",
    description: "Recycle bin, retention controls, and restoration workflows.",
  },
};

export function getFeatureDetail(
  code: string,
  name?: string | null,
  description?: string | null
): FeatureDetail {
  const catalog = FEATURE_DETAILS[code];
  return {
    name: name?.trim() || catalog?.name || code.replaceAll("_", " "),
    description:
      description?.trim() ||
      catalog?.description ||
      "Controlled tenant capability.",
  };
}
