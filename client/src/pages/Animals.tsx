import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Eye, Leaf, Plus, Search, Trash2, AlertTriangle } from "lucide-react";
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
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";

function StatusBadge({ status }: { status: string }) {
  const lower = status?.toLowerCase() ?? "";
  if (lower.includes("active") || lower.includes("fattening") || lower.includes("breeding")) {
    return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">{status}</Badge>;
  }
  if (lower.includes("sold")) return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">{status}</Badge>;
  if (lower.includes("dead") || lower.includes("mort")) return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">{status}</Badge>;
  if (lower.includes("transport")) return <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">{status}</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

function AddAnimalDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { control, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      speciesId: "",
      categoryId: "",
      groupId: "",
      statusId: "",
      sex: "",
      acquisitionType: "",
      acquisitionDate: new Date().toISOString().split("T")[0],
      birthDate: new Date().toISOString().split("T")[0],
      purchaseCost: "",
      weightAtAcquisition: "",
    },
  });

  const selectedSpeciesId = watch("speciesId");

  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: categories } = trpc.config.getCategories.useQuery(
    { speciesId: selectedSpeciesId ? Number(selectedSpeciesId) : undefined }
  );
  const { data: groups } = trpc.config.getGroups.useQuery(
    { speciesId: selectedSpeciesId ? Number(selectedSpeciesId) : undefined }
  );
  const { data: statuses } = trpc.config.getStatuses.useQuery();

  const utils = trpc.useUtils();
  const createAnimal = trpc.animals.create.useMutation({
    onSuccess: () => {
      toast.success("Animal registered successfully");
      utils.animals.list.invalidate();
      setOpen(false);
      reset();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (data: any) => {
    if (!data.speciesId || !data.categoryId || !data.groupId || !data.statusId || !data.sex || !data.acquisitionType) {
      toast.error("Please fill all required fields");
      return;
    }
    createAnimal.mutate({
      speciesId: Number(data.speciesId),
      categoryId: Number(data.categoryId),
      groupId: Number(data.groupId),
      statusId: Number(data.statusId),
      sex: data.sex as "male" | "female",
      acquisitionType: data.acquisitionType as "purchased" | "born",
      acquisitionDate: data.acquisitionDate,
      birthDate: data.birthDate,
      purchaseCost: data.purchaseCost || undefined,
      weightAtAcquisition: data.weightAtAcquisition || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Register Animal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register New Animal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Species *</Label>
              <Controller name="speciesId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select species" /></SelectTrigger>
                  <SelectContent>
                    {(species ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Controller name="categoryId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={!selectedSpeciesId}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.idPrefix})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Group / Pen *</Label>
              <Controller name="groupId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                  <SelectContent>
                    {(groups ?? []).map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Status *</Label>
              <Controller name="statusId" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    {(statuses ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Sex *</Label>
              <Controller name="sex" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select sex" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Acquisition Type *</Label>
              <Controller name="acquisitionType" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchased">Purchased</SelectItem>
                    <SelectItem value="born">Born on Farm</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Acquisition Date *</Label>
              <Controller name="acquisitionDate" control={control} render={({ field }) => (
                <Input type="date" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Birth Date *</Label>
              <Controller name="birthDate" control={control} render={({ field }) => (
                <Input type="date" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Purchase Cost</Label>
              <Controller name="purchaseCost" control={control} render={({ field }) => (
                <Input type="number" placeholder="0.00" {...field} />
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Weight at Acquisition (kg)</Label>
              <Controller name="weightAtAcquisition" control={control} render={({ field }) => (
                <Input type="number" placeholder="0.0" {...field} />
              )} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createAnimal.isPending}>
              {createAnimal.isPending ? "Registering..." : "Register Animal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Animals() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterSpecies, setFilterSpecies] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("active");
  const utils = trpc.useUtils();
  const deleteAnimalMutation = trpc.recycleBin.deleteAnimal.useMutation({
    onSuccess: () => {
      toast.success("Animal moved to Recycle Bin");
      utils.animals.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: animals, isLoading, refetch } = trpc.animals.list.useQuery({
    isActive: filterActive === "active" ? true : filterActive === "inactive" ? false : undefined,
    speciesId: filterSpecies !== "all" ? Number(filterSpecies) : undefined,
    statusId: filterStatus !== "all" ? Number(filterStatus) : undefined,
  });

  const { data: species } = trpc.config.getSpecies.useQuery();
  const { data: statuses } = trpc.config.getStatuses.useQuery();

  const filtered = (animals ?? []).filter((a: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.animal.animalId?.toLowerCase().includes(q) ||
      a.categoryName?.toLowerCase().includes(q) ||
      a.speciesName?.toLowerCase().includes(q) ||
      a.groupName?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Leaf className="h-6 w-6 text-primary" />
            Animal Registry
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} animals · All lifecycle stages
          </p>
        </div>
        <AddAnimalDialog onSuccess={refetch} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, category, species..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterActive} onValueChange={setFilterActive}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Exited</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSpecies} onValueChange={setFilterSpecies}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Species" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Species</SelectItem>
                {(species ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {(statuses ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Animal ID</TableHead>
                    <TableHead>Species</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Sex</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Acquisition</TableHead>
                    <TableHead>Days on Farm</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        No animals found. Register the first animal to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((a: any) => {
                      const acqDate = new Date(a.animal.acquisitionDate);
                      const exitDate = a.animal.exitDate ? new Date(a.animal.exitDate) : new Date();
                      const days = Math.floor((exitDate.getTime() - acqDate.getTime()) / (1000 * 60 * 60 * 24));
                      return (
                        <TableRow key={a.animal.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setLocation(`/animals/${a.animal.id}`)}>
                          <TableCell className="font-mono font-semibold text-primary">{a.animal.animalId}</TableCell>
                          <TableCell>{a.speciesName}</TableCell>
                          <TableCell>{a.categoryName}</TableCell>
                          <TableCell>{a.groupName}</TableCell>
                          <TableCell className="capitalize">{a.animal.sex}</TableCell>
                          <TableCell><StatusBadge status={a.statusName ?? ""} /></TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(a.animal.acquisitionDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>{days}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); setLocation(`/animals/${a.animal.id}`); }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="flex items-center gap-2">
                                      <AlertTriangle className="h-5 w-5 text-destructive" />
                                      Delete Animal
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Move <strong>{a.animal.animalId}</strong> and all related records to the Recycle Bin? You can restore it anytime.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive hover:bg-destructive/90"
                                      onClick={(e) => { e.stopPropagation(); deleteAnimalMutation.mutate({ id: a.animal.id }); }}
                                    >
                                      Move to Bin
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
