import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { SlidersHorizontal } from "lucide-react";
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
import { platformTrpc } from "@admin/lib/trpc";
import { getFeatureDetail } from "@admin/lib/featureCatalog";

export function FeaturesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const page = useCursorPage();
  const query = platformTrpc.features.list.useQuery({
    cursor: page.cursor,
    limit: 25,
    search: useDeferredValue(search) || undefined,
    status: status === "all" ? undefined : (status as "active"),
    sortDirection: "desc",
  });
  const companies = platformTrpc.companies.list.useQuery({
    limit: 100,
    status: "active",
    sortDirection: "desc",
  });
  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const [target, setTarget] = useState<Row | null>(null);
  const [companyPublicId, setCompanyPublicId] = useState("");
  const [accessMode, setAccessMode] = useState<
    "enabled" | "read_only" | "disabled"
  >("enabled");
  const [limit, setLimit] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [reason, setReason] = useState("");
  const mutation = platformTrpc.features.setOverride.useMutation({
    onSuccess: async () => {
      toast.success("Feature override applied");
      setTarget(null);
      setReason("");
      setExpiresOn("");
      await Promise.all([companies.refetch(), query.refetch()]);
    },
    onError: error => toast.error(error.message),
  });
  const columns: ResourceColumn<Row>[] = [
    {
      key: "feature",
      label: "Feature",
      render: row => {
        const feature = getFeatureDetail(row.code, row.name, row.description);
        return (
          <div className="max-w-md">
            <p className="font-medium">{feature.name}</p>
            <p className="text-xs text-muted-foreground">
              {feature.description}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {row.code}
            </p>
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: row => <StatusBadge value={row.status} />,
    },
    {
      key: "mode",
      label: "Disabled data",
      render: row => <StatusBadge value={row.disabledDataMode} />,
    },
    {
      key: "unit",
      label: "Limit unit",
      render: row => <span className="capitalize">{row.limitUnit}</span>,
    },
    {
      key: "plans",
      label: "Plans",
      className: "text-right",
      render: row => Number(row.planCount),
    },
    {
      key: "overrides",
      label: "Overrides",
      className: "text-right",
      render: row => Number(row.activeOverrideCount),
    },
    {
      key: "action",
      label: "",
      className: "w-12",
      render: row => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTarget(row)}
          aria-label={`Override ${row.name}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      ),
    },
  ];
  return (
    <>
      <PageHeading
        title="Features"
        description="Feature catalog and time-limited company overrides. Disabling never deletes tenant data."
      />
      <ListToolbar
        search={search}
        onSearch={value => {
          setSearch(value);
          page.reset();
        }}
        placeholder="Search feature name or code"
        status={status}
        onStatus={value => {
          setStatus(value);
          page.reset();
        }}
        statuses={["active", "deprecated"]}
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
        open={Boolean(target)}
        onOpenChange={open => {
          if (!open) {
            setTarget(null);
            setExpiresOn("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override {target?.name}</DialogTitle>
            <DialogDescription>
              Company-specific access takes precedence over its current plan
              until revoked or expired.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Company</Label>
              <Select
                value={companyPublicId}
                onValueChange={setCompanyPublicId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.data?.items.map(company => (
                    <SelectItem key={company.publicId} value={company.publicId}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Access mode</Label>
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
              <Label htmlFor="feature-limit">Limit (optional)</Label>
              <Input
                id="feature-limit"
                type="number"
                min="0"
                value={limit}
                onChange={event => setLimit(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="feature-expiry">Expires on (optional)</Label>
              <Input
                id="feature-expiry"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={expiresOn}
                onChange={event => setExpiresOn(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="feature-reason">Reason</Label>
              <Textarea
                id="feature-reason"
                value={reason}
                onChange={event => setReason(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTarget(null);
                setExpiresOn("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !target ||
                !companyPublicId ||
                reason.trim().length < 5 ||
                mutation.isPending
              }
              onClick={() => {
                const company = companies.data?.items.find(
                  item => item.publicId === companyPublicId
                );
                if (target && company)
                  mutation.mutate({
                    companyPublicId,
                    featurePublicId: target.publicId,
                    expectedEntitlementVersion: company.entitlementVersion,
                    accessMode,
                    limitValue: limit ? Number(limit) : null,
                    expiresAt: expiresOn
                      ? new Date(`${expiresOn}T23:59:59.999Z`)
                      : null,
                    reason,
                  });
              }}
            >
              Apply override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
