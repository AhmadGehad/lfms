import type { PermissionPage } from "@shared/permissions";

export type Explanation = { title: string; body: string };

/** What each area of the system is for, shared by the tour and the help marks. */
export const PAGE_GUIDE: Partial<Record<PermissionPage, Explanation & { path: string }>> = {
  dashboard: {
    path: "/",
    title: "Dashboard",
    body: "The day's overview: herd size, animals due for attention, recent sales and costs. Each figure links through to the records behind it.",
  },
  animals: {
    path: "/animals",
    title: "Animals",
    body: "Every animal on the farm with its code, species, sex, pen, owner and status. Search, filter and open any animal to see its full history.",
  },
  breeding: {
    path: "/breeding",
    title: "Breeding",
    body: "Record matings and track which females were served, by which male, and when. Expected pregnancy checks follow from these dates.",
  },
  pregnancy: {
    path: "/pregnancy",
    title: "Pregnancy",
    body: "Confirmed pregnancies with expected birth dates. Animals close to term are flagged so births can be prepared for and recorded.",
  },
  fattening: {
    path: "/fattening",
    title: "Fattening",
    body: "Groups on a fattening programme with their weigh-ins, daily gain and feed cost, so you can see when each group is ready for sale.",
  },
  feed: {
    path: "/feed",
    title: "Feed",
    body: "Feed stock, purchases, ration plans and daily usage. Low stock and shrinkage are calculated from what was bought and what was fed.",
  },
  vaccinations: {
    path: "/vaccinations",
    title: "Vaccinations",
    body: "Vaccination schedules and records per animal. Doses that are due soon or overdue are shown first.",
  },
  expenses: {
    path: "/expenses",
    title: "Expenses",
    body: "All farm costs by category and date: feed, vet, labour, equipment. These feed directly into the profit reports.",
  },
  pnl: {
    path: "/pnl",
    title: "Profit & loss",
    body: "Profit and loss per animal, group or period, combining purchase price, feed, treatment costs and sale value.",
  },
  incomeStatement: {
    path: "/income-statement",
    title: "Income statement",
    body: "A formal income statement for any period: revenue, cost of sales, operating expenses and net result.",
  },
  sales: {
    path: "/sales",
    title: "Sales",
    body: "Animals sold, to whom, at what weight and price. A sale closes the animal's record while keeping its history.",
  },
  notifications: {
    path: "/notifications",
    title: "Notifications",
    body: "Reminders the system raises for you: due vaccinations, expected births, low feed stock and other events that need action.",
  },
  audit: {
    path: "/audit",
    title: "Audit log",
    body: "Who changed what and when. Every create, edit and delete is recorded so the farm's records can always be traced.",
  },
  users: {
    path: "/users",
    title: "Users",
    body: "Invite team members and decide what each person can see and change, page by page.",
  },
  configuration: {
    path: "/config",
    title: "Configuration",
    body: "The lists the rest of the system uses: breeds, pens, expense categories, feed types, vaccines and owners.",
  },
  farmMap: {
    path: "/farm-map",
    title: "Farm map",
    body: "A plan of the farm's pens and areas, showing where animals are kept.",
  },
  data: {
    path: "/data",
    title: "Data",
    body: "Import animals and records from spreadsheets, or export your data whenever you need it.",
  },
  recycleBin: {
    path: "/recycle-bin",
    title: "Recycle bin",
    body: "Deleted records are kept here and can be restored. Nothing disappears by accident.",
  },
};

export const CONTROL_GUIDE: Record<string, Explanation> = {
  "sidebar-nav": {
    title: "Navigation",
    body: "Every part of the system is one click away, grouped by herd, operations, finance and administration.",
  },
  topbar: {
    title: "Top bar",
    body: "Controls that apply to every page: which farm you are looking at and whose animals are shown.",
  },
  "farm-switcher": {
    title: "Farm switcher",
    body: "If your company runs more than one farm, switch between them here. Every page then shows that farm's records.",
  },
  "owner-filter": {
    title: "Owner filter",
    body: "Animals can belong to different owners or partners. Pick an owner to see only their animals and figures across the system.",
  },
  "user-menu": {
    title: "Your account",
    body: "Language, theme and sign-out.",
  },
};

const BUTTON_GUIDE: Array<[RegExp, Explanation]> = [
  [/export|download|csv|excel|pdf|print/i, { title: "Export", body: "Download these records as a file to share or keep outside the system." }],
  [/import|upload/i, { title: "Import", body: "Bring records in from a spreadsheet instead of typing them one by one." }],
  [/filter/i, { title: "Filter", body: "Narrow the list to the records you care about." }],
  [/(add|new|create|record|register|log)\b.*(animal|birth|lamb|mating|breed)/i, { title: "Add a record", body: "Opens a short form. Required fields are marked, and the record appears in the list as soon as it is saved." }],
  [/sale|sell/i, { title: "Record a sale", body: "Choose the animals sold, the buyer, weight and price. Profit is calculated automatically." }],
  [/expense|cost/i, { title: "Add an expense", body: "Log a cost with its category and date so it counts toward the profit reports." }],
  [/vaccin|dose/i, { title: "Record a vaccination", body: "Log a dose for one animal or a whole group. The next due date is set from the schedule." }],
  [/feed|ration|stock/i, { title: "Feed", body: "Record purchases or usage so stock levels and costs stay accurate." }],
  [/weigh|weight/i, { title: "Weigh-in", body: "Record weights to track daily gain." }],
  [/invite|user/i, { title: "Invite a user", body: "Send an invitation and choose what this person may access." }],
  [/restore/i, { title: "Restore", body: "Put a deleted record back where it was." }],
  [/^(add|new|create|record|\+)/i, { title: "Add a record", body: "Opens a form to add a new entry to this page." }],
  [/edit/i, { title: "Edit", body: "Change this record. The previous values are kept in the audit log." }],
  [/delete|remove/i, { title: "Delete", body: "Moves the record to the recycle bin, where it can be restored." }],
];

export function explainButton(label: string): Explanation | null {
  const text = label.trim();
  if (!text) return null;
  for (const [pattern, explanation] of BUTTON_GUIDE) if (pattern.test(text)) return explanation;
  return null;
}

export const TABLE_GUIDE: Explanation = {
  title: "Records",
  body: "Each row is one record. Click a row or its actions to open, edit or delete it. Column headers sort the list.",
};

export const TAB_GUIDE: Explanation = {
  title: "Sections",
  body: "This page is split into sections. Switch between them without losing your place.",
};

export const CARD_GUIDE: Explanation = {
  title: "Summary figure",
  body: "A live figure calculated from the farm's records. It updates as soon as new records are saved.",
};

export type TourStep = Explanation & {
  /** Route inside the demo to show for this step. */
  path?: string;
  /** Element to highlight; omitted means a centred card. */
  target?: string;
};

const pageStep = (page: PermissionPage, extra?: string): TourStep => {
  const guide = PAGE_GUIDE[page]!;
  return {
    path: guide.path,
    target: "main h1",
    title: guide.title,
    body: extra ? `${guide.body} ${extra}` : guide.body,
  };
};

export const TOUR_STEPS: TourStep[] = [
  {
    path: "/",
    title: "Welcome to APIS",
    body: "This is a working copy of APIS filled with sample records from a demo farm. Follow the tour, or skip it and explore freely. Nothing you do here is saved.",
  },
  { path: "/", target: "[data-tour='sidebar-nav']", ...CONTROL_GUIDE["sidebar-nav"] },
  { path: "/", target: "[data-tour='farm-switcher']", ...CONTROL_GUIDE["farm-switcher"] },
  { path: "/", target: "[data-tour='owner-filter']", ...CONTROL_GUIDE["owner-filter"] },
  pageStep("dashboard"),
  pageStep("animals"),
  {
    path: "/animals/1",
    target: "main h1",
    title: "An animal's record",
    body: "One page for one animal: identity, parents, weights, breeding, vaccinations, treatments and costs. The history stays with the animal for its whole life.",
  },
  pageStep("breeding"),
  pageStep("pregnancy"),
  pageStep("fattening"),
  pageStep("feed"),
  pageStep("vaccinations"),
  pageStep("expenses"),
  pageStep("sales"),
  pageStep("pnl"),
  pageStep("incomeStatement"),
  pageStep("notifications"),
  pageStep("users"),
  pageStep("configuration"),
  pageStep("audit", "Deleted records go to the recycle bin and can be restored."),
  {
    title: "Explore on your own",
    body: "That's the tour. Look for the ? marks on buttons, tables and menu items: click any of them for a short explanation. You can restart the tour from the bar at the bottom.",
  },
];
