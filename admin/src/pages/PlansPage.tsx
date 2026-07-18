import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Archive, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import {
  ResourceTable,
  type ResourceColumn,
} from "@admin/components/ResourceTable";
import { StatusBadge } from "@admin/components/StatusBadge";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate, formatMoney } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";
import { getFeatureDetail } from "@admin/lib/featureCatalog";

export function PlansPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const page = useCursorPage();
  const query = platformTrpc.plans.list.useQuery({
    cursor: page.cursor,
    limit: 25,
    search: useDeferredValue(search) || undefined,
    status: status === "all" ? undefined : (status as "active"),
    sortDirection: "desc",
  });
  const features = platformTrpc.features.list.useQuery({
    limit: 100,
    status: "active",
    sortDirection: "desc",
  });
  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const [publishTarget, setPublishTarget] = useState<Row | null>(null);
  const [retireTarget, setRetireTarget] = useState<Row | null>(null);
  const [editTarget, setEditTarget] = useState<Row | null>(null);
  const [editName, setEditName] = useState("");
  const [editMonthly, setEditMonthly] = useState("0");
  const [editYearly, setEditYearly] = useState("0");
  const [editCurrency, setEditCurrency] = useState("USD");
  const utils = platformTrpc.useUtils();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [monthly, setMonthly] = useState("0");
  const [yearly, setYearly] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [featurePublicId, setFeaturePublicId] = useState("");
  const [accessMode, setAccessMode] = useState<
    "enabled" | "read_only" | "disabled"
  >("enabled");
  const [limit, setLimit] = useState("");
  const [entitlements, setEntitlements] = useState<
    Array<{
      featurePublicId: string;
      featureName: string;
      accessMode: "enabled" | "read_only" | "disabled";
      limitValue: number | null;
    }>
  >([]);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID()
  );
  const create = platformTrpc.plans.create.useMutation({
    onSuccess: async () => {
      toast.success("Draft plan created");
      setOpen(false);
      setCode("");
      setName("");
      setEntitlements([]);
      setIdempotencyKey(crypto.randomUUID());
      await utils.plans.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const publish = platformTrpc.plans.publish.useMutation({
    onSuccess: async () => {
      toast.success("Plan published");
      await utils.plans.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateDraft = platformTrpc.plans.updateDraft.useMutation({
    onSuccess: async () => {
      toast.success("Plan pricing updated");
      setEditTarget(null);
      await utils.plans.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const retire = platformTrpc.plans.retire.useMutation({
    onSuccess: async () => {
      toast.success("Plan retired");
      await utils.plans.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const openEdit = (row: Row) => {
    setEditTarget(row);
    setEditName(row.name);
    setEditMonthly(String(row.priceMonthly));
    setEditYearly(String(row.priceYearly));
    setEditCurrency(row.currency);
  };
  const columns: ResourceColumn<Row>[] = [
    {
      key: "plan",
      label: "Plan",
      render: row => (
        <div>
          <p className="font-medium">{row.name}</p>
          {row.description && (
            <p className="max-w-sm text-xs text-muted-foreground">
              {row.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {row.code} · v{row.planVersion}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: row => <StatusBadge value={row.status} />,
    },
    {
      key: "monthly",
      label: "Monthly",
      className: "text-right",
      render: row => (
        <span className="tabular-nums">
          {formatMoney(row.priceMonthly, row.currency)}
        </span>
      ),
    },
    {
      key: "yearly",
      label: "Yearly",
      className: "text-right",
      render: row => (
        <span className="tabular-nums">
          {formatMoney(row.priceYearly, row.currency)}
        </span>
      ),
    },
    {
      key: "features",
      label: "Features",
      className: "text-right",
      render: row => Number(row.entitlementCount),
    },
    {
      key: "companies",
      label: "Companies",
      className: "text-right",
      render: row => Number(row.companyCount),
    },
    {
      key: "published",
      label: "Published",
      render: row => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(row.publishedAt)}
        </span>
      ),
    },
    {
      key: "action",
      label: "",
      className: "w-32",
      render: row => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            disabled={row.status === "retired" || updateDraft.isPending}
            onClick={() => openEdit(row)}
            aria-label={`Edit ${row.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={row.status !== "draft" || publish.isPending}
            onClick={() => setPublishTarget(row)}
            aria-label={`Publish ${row.name}`}
          >
            <Send className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={row.status !== "active" || retire.isPending}
            onClick={() => setRetireTarget(row)}
            aria-label={`Retire ${row.name}`}
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeading
        title="Plans"
        description="Versioned entitlement bundles. Active-plan pricing can be updated; active features stay fixed."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                New plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Create draft plan</DialogTitle>
                <DialogDescription>
                  Configure the complete feature and limit bundle before
                  publication.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="plan-code">Code</Label>
                  <Input
                    id="plan-code"
                    value={code}
                    onChange={event =>
                      setCode(
                        event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, "")
                      )
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="plan-name">Name</Label>
                  <Input
                    id="plan-name"
                    value={name}
                    onChange={event => setName(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="monthly">Monthly price</Label>
                  <Input
                    id="monthly"
                    inputMode="decimal"
                    value={monthly}
                    onChange={event => setMonthly(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="yearly">Yearly price</Label>
                  <Input
                    id="yearly"
                    inputMode="decimal"
                    value={yearly}
                    onChange={event => setYearly(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    maxLength={3}
                    value={currency}
                    onChange={event =>
                      setCurrency(event.target.value.toUpperCase())
                    }
                  />
                </div>
              </div>
              <div className="grid min-w-0 gap-3 border-y border-border py-3 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,140px)_minmax(6rem,120px)_auto]">
                <div className="grid gap-1.5">
                  <Label>Feature</Label>
                  <Select
                    value={featurePublicId}
                    onValueChange={setFeaturePublicId}
                  >
                    <SelectTrigger className="[&_[data-slot=select-value]_.feature-option-description]:hidden [&_[data-slot=select-value]_.feature-option-name]:truncate">
                      <SelectValue placeholder="Select feature" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[min(30rem,calc(100vw-2rem))]">
                      {features.data?.items
                        .filter(
                          feature =>
                            !entitlements.some(
                              item => item.featurePublicId === feature.publicId
                            )
                        )
                        .map(feature => {
                          const detail = getFeatureDetail(
                            feature.code,
                            feature.name,
                            feature.description
                          );
                          return (
                            <SelectItem
                              key={feature.publicId}
                              value={feature.publicId}
                              className="items-start whitespace-normal"
                            >
                              <span className="feature-option-name block min-w-0 whitespace-normal break-words font-medium">
                                {detail.name}
                              </span>
                              <span className="feature-option-description block whitespace-normal break-words text-xs text-muted-foreground">
                                {detail.description}
                              </span>
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Access</Label>
                  <Select
                    value={accessMode}
                    onValueChange={value =>
                      setAccessMode(value as typeof accessMode)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enabled">Enabled</SelectItem>
                      <SelectItem value="read_only">Read only</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="plan-limit">Limit</Label>
                  <Input
                    id="plan-limit"
                    type="number"
                    min="0"
                    value={limit}
                    onChange={event => setLimit(event.target.value)}
                  />
                </div>
                <Button
                  className="w-full self-end sm:w-auto"
                  variant="outline"
                  disabled={!featurePublicId}
                  onClick={() => {
                    const feature = features.data?.items.find(
                      item => item.publicId === featurePublicId
                    );
                    if (
                      !feature ||
                      entitlements.some(
                        item => item.featurePublicId === feature.publicId
                      )
                    )
                      return;
                    setEntitlements(current => [
                      ...current,
                      {
                        featurePublicId,
                        featureName: feature.name,
                        accessMode,
                        limitValue: limit ? Number(limit) : null,
                      },
                    ]);
                    setFeaturePublicId("");
                    setLimit("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
              <div className="grid gap-2">
                {entitlements.map(item => {
                  const feature = features.data?.items.find(
                    value => value.publicId === item.featurePublicId
                  );
                  const detail = getFeatureDetail(
                    feature?.code ?? "",
                    item.featureName,
                    feature?.description
                  );
                  return (
                    <div
                      key={item.featurePublicId}
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 border border-border px-3 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-medium">
                          {detail.name}
                        </span>
                        <span className="block break-words text-xs text-muted-foreground">
                          {detail.description}
                        </span>
                      </span>
                      <span className="capitalize text-muted-foreground">
                        {item.accessMode.replaceAll("_", " ")}
                      </span>
                      <span className="tabular-nums">
                        {item.limitValue === null
                          ? "Unlimited"
                          : item.limitValue}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setEntitlements(current =>
                            current.filter(
                              value =>
                                value.featurePublicId !== item.featurePublicId
                            )
                          )
                        }
                        aria-label={`Remove ${item.featureName}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={
                    create.isPending ||
                    code.length < 2 ||
                    name.length < 2 ||
                    entitlements.length === 0 ||
                    currency.length !== 3
                  }
                  onClick={() =>
                    create.mutate({
                      code,
                      name,
                      priceMonthly: monthly,
                      priceYearly: yearly,
                      currency,
                      entitlements: entitlements.map(
                        ({ featureName: _featureName, ...item }) => item
                      ),
                      idempotencyKey,
                    })
                  }
                >
                  Create draft
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <ListToolbar
        search={search}
        onSearch={value => {
          setSearch(value);
          page.reset();
        }}
        placeholder="Search plan name or code"
        status={status}
        onStatus={value => {
          setStatus(value);
          page.reset();
        }}
        statuses={["draft", "active", "retired"]}
      />
      <ResourceTable
        rows={rows}
        columns={columns}
        rowKey={row => row.publicId}
        loading={query.isLoading}
        canNext={Boolean(query.data?.nextCursor)}
        canPrevious={page.canPrevious}
        onNext={() =>
          query.data?.nextCursor && page.next(query.data.nextCursor)
        }
        onPrevious={page.previous}
      />
      <Dialog
        open={Boolean(editTarget)}
        onOpenChange={open => !open && setEditTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit plan pricing</DialogTitle>
            <DialogDescription>
              Active plans allow pricing and display updates. Feature bundles
              remain fixed after publication.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-plan-name">Name</Label>
              <Input
                id="edit-plan-name"
                value={editName}
                onChange={event => setEditName(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-monthly">Monthly</Label>
                <Input
                  id="edit-monthly"
                  inputMode="decimal"
                  value={editMonthly}
                  onChange={event => setEditMonthly(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-yearly">Yearly</Label>
                <Input
                  id="edit-yearly"
                  inputMode="decimal"
                  value={editYearly}
                  onChange={event => setEditYearly(event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-currency">Currency</Label>
              <Input
                id="edit-currency"
                maxLength={3}
                value={editCurrency}
                onChange={event =>
                  setEditCurrency(event.target.value.toUpperCase())
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                !editTarget ||
                updateDraft.isPending ||
                editName.trim().length < 2 ||
                editCurrency.length !== 3
              }
              onClick={() =>
                editTarget &&
                updateDraft.mutate({
                  publicId: editTarget.publicId,
                  expectedVersion: editTarget.version,
                  name: editName.trim(),
                  priceMonthly: editMonthly,
                  priceYearly: editYearly,
                  currency: editCurrency,
                })
              }
            >
              Save plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(publishTarget)}
        onOpenChange={open => !open && setPublishTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish plan version</AlertDialogTitle>
            <AlertDialogDescription>
              {publishTarget?.name} v{publishTarget?.planVersion} becomes
              immutable and available for subscription assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (publishTarget)
                  publish.mutate({
                    publicId: publishTarget.publicId,
                    expectedVersion: publishTarget.version,
                  });
                setPublishTarget(null);
              }}
            >
              Publish plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(retireTarget)}
        onOpenChange={open => !open && setRetireTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire plan</AlertDialogTitle>
            <AlertDialogDescription>
              New subscriptions cannot use {retireTarget?.name}. Existing
              subscriptions keep their immutable plan snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (retireTarget)
                  retire.mutate({
                    publicId: retireTarget.publicId,
                    expectedVersion: retireTarget.version,
                  });
                setRetireTarget(null);
              }}
            >
              Retire plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
