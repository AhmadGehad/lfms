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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { ListToolbar } from "@admin/components/ListToolbar";
import { PageHeading } from "@admin/components/PageHeading";
import {
  ResourceTable,
  type ResourceColumn,
} from "@admin/components/ResourceTable";
import { StatusBadge } from "@admin/components/StatusBadge";
import { useCursorPage } from "@admin/hooks/useCursorPage";
import { formatDate } from "@admin/lib/format";
import { platformTrpc } from "@admin/lib/trpc";

export function SubscriptionsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const page = useCursorPage();
  const query = platformTrpc.subscriptions.list.useQuery({
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
  const plans = platformTrpc.plans.list.useQuery({
    limit: 100,
    status: "active",
    sortDirection: "desc",
  });
  const rows = query.data?.items ?? [];
  type Row = (typeof rows)[number];
  const [pendingStatus, setPendingStatus] = useState<{
    row: Row;
    status: "active" | "suspended" | "canceled";
  } | null>(null);
  const [editTarget, setEditTarget] = useState<Row | null>(null);
  const [editPeriodStart, setEditPeriodStart] = useState("");
  const [editPeriodEnd, setEditPeriodEnd] = useState("");
  const columns: ResourceColumn<Row>[] = [
    {
      key: "company",
      label: "Company",
      render: row => <span className="font-medium">{row.companyName}</span>,
    },
    {
      key: "plan",
      label: "Plan",
      render: row => (
        <div>
          <p>{row.planName}</p>
          <p className="text-xs text-muted-foreground">{row.planCode}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: row => <StatusBadge value={row.status} />,
    },
    {
      key: "period",
      label: "Period",
      render: row => (
        <span className="text-xs">
          {formatDate(row.periodStart)} - {formatDate(row.periodEnd)}
        </span>
      ),
    },
    {
      key: "current",
      label: "Current",
      render: row => (row.isCurrent ? "Yes" : "No"),
    },
    {
      key: "actions",
      label: "",
      className: "w-12",
      render: row => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={
                !row.isCurrent || ["canceled", "expired"].includes(row.status)
              }
              aria-label={`Manage ${row.companyName} subscription`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setEditTarget(row);
                setEditPeriodStart(
                  new Date(row.periodStart).toISOString().slice(0, 10)
                );
                setEditPeriodEnd(
                  new Date(row.periodEnd).toISOString().slice(0, 10)
                );
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit period
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={row.status === "active"}
              onClick={() => setPendingStatus({ row, status: "active" })}
            >
              Activate
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={row.status === "suspended"}
              onClick={() => setPendingStatus({ row, status: "suspended" })}
            >
              Suspend
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setPendingStatus({ row, status: "canceled" })}
            >
              Cancel subscription
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  const [open, setOpen] = useState(false);
  const [companyPublicId, setCompanyPublicId] = useState("");
  const [planPublicId, setPlanPublicId] = useState("");
  const [nextStatus, setNextStatus] = useState<
    "trialing" | "active" | "past_due" | "suspended"
  >("active");
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const trialDefault = new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const graceDefault = new Date(Date.now() + 372 * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(nextYear);
  const [trialEndsAt, setTrialEndsAt] = useState(trialDefault);
  const [graceEndsAt, setGraceEndsAt] = useState(graceDefault);
  const [assignIdempotencyKey, setAssignIdempotencyKey] = useState(() =>
    crypto.randomUUID()
  );
  const company = useMemo(
    () => companies.data?.items.find(item => item.publicId === companyPublicId),
    [companies.data, companyPublicId]
  );
  const utils = platformTrpc.useUtils();
  const assign = platformTrpc.subscriptions.assign.useMutation({
    onSuccess: async () => {
      toast.success("Subscription assigned");
      setOpen(false);
      setAssignIdempotencyKey(crypto.randomUUID());
      await Promise.all([
        utils.subscriptions.list.invalidate(),
        utils.companies.list.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const update = platformTrpc.subscriptions.update.useMutation({
    onSuccess: async () => {
      toast.success("Subscription updated");
      setPendingStatus(null);
      setEditTarget(null);
      await Promise.all([
        utils.subscriptions.list.invalidate(),
        utils.companies.list.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });

  return (
    <>
      <PageHeading
        title="Subscriptions"
        description="Current assignments and retained subscription history."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Assign plan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign subscription</DialogTitle>
                <DialogDescription>
                  The prior current subscription is retained as history.
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
                      {companies.data?.items.map(item => (
                        <SelectItem key={item.publicId} value={item.publicId}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Plan</Label>
                  <Select value={planPublicId} onValueChange={setPlanPublicId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.data?.items.map(item => (
                        <SelectItem key={item.publicId} value={item.publicId}>
                          <span className="block font-medium">
                            {item.name} v{item.planVersion}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {item.description ||
                              `${Number(item.entitlementCount)} included features`}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select
                    value={nextStatus}
                    onValueChange={value =>
                      setNextStatus(value as typeof nextStatus)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trialing">Trialing</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="past_due">Past due</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="period-start">Starts</Label>
                    <Input
                      id="period-start"
                      type="date"
                      value={periodStart}
                      onChange={event => setPeriodStart(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="period-end">Ends</Label>
                    <Input
                      id="period-end"
                      type="date"
                      value={periodEnd}
                      onChange={event => setPeriodEnd(event.target.value)}
                    />
                  </div>
                </div>
                {nextStatus === "trialing" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="trial-end">Trial ends</Label>
                    <Input
                      id="trial-end"
                      type="date"
                      value={trialEndsAt}
                      onChange={event => setTrialEndsAt(event.target.value)}
                    />
                  </div>
                )}
                {nextStatus === "past_due" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="grace-end">Grace ends</Label>
                    <Input
                      id="grace-end"
                      type="date"
                      value={graceEndsAt}
                      onChange={event => setGraceEndsAt(event.target.value)}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={
                    !company ||
                    !planPublicId ||
                    !periodStart ||
                    !periodEnd ||
                    (nextStatus === "trialing" && !trialEndsAt) ||
                    (nextStatus === "past_due" && !graceEndsAt) ||
                    assign.isPending
                  }
                  onClick={() =>
                    company &&
                    assign.mutate({
                      companyPublicId,
                      planPublicId,
                      status: nextStatus,
                      periodStart: new Date(`${periodStart}T00:00:00Z`),
                      periodEnd: new Date(`${periodEnd}T23:59:59Z`),
                      trialEndsAt:
                        nextStatus === "trialing"
                          ? new Date(`${trialEndsAt}T23:59:59Z`)
                          : null,
                      graceEndsAt:
                        nextStatus === "past_due"
                          ? new Date(`${graceEndsAt}T23:59:59Z`)
                          : null,
                      expectedCompanyVersion: company.version,
                      idempotencyKey: assignIdempotencyKey,
                    })
                  }
                >
                  Assign
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
        placeholder="Search company or plan"
        status={status}
        onStatus={value => {
          setStatus(value);
          page.reset();
        }}
        statuses={[
          "trialing",
          "active",
          "past_due",
          "suspended",
          "canceled",
          "expired",
        ]}
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
            <DialogTitle>Edit subscription period</DialogTitle>
            <DialogDescription>
              Changes apply immediately and invalidate tenant entitlement
              caches.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-sub-start">Starts</Label>
              <Input
                id="edit-sub-start"
                type="date"
                value={editPeriodStart}
                onChange={event => setEditPeriodStart(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-sub-end">Ends</Label>
              <Input
                id="edit-sub-end"
                type="date"
                value={editPeriodEnd}
                onChange={event => setEditPeriodEnd(event.target.value)}
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
                !editPeriodStart ||
                !editPeriodEnd ||
                update.isPending
              }
              onClick={() =>
                editTarget &&
                update.mutate({
                  publicId: editTarget.publicId,
                  expectedVersion: editTarget.version,
                  periodStart: new Date(`${editPeriodStart}T00:00:00Z`),
                  periodEnd: new Date(`${editPeriodEnd}T23:59:59Z`),
                })
              }
            >
              Save period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(pendingStatus)}
        onOpenChange={open => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="capitalize">
              {pendingStatus?.status} subscription
            </AlertDialogTitle>
            <AlertDialogDescription>
              This immediately changes feature access for{" "}
              {pendingStatus?.row.companyName}. Existing tenant data remains
              retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingStatus &&
                update.mutate({
                  publicId: pendingStatus.row.publicId,
                  expectedVersion: pendingStatus.row.version,
                  status: pendingStatus.status,
                })
              }
            >
              Confirm change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
