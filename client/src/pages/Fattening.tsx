import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Scale, Plus } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function Fattening() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [animalId, setAnimalId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [weight, setWeight] = useState("");

  const { data: animals } = trpc.animals.list.useQuery({ isActive: true });
  const fatteningAnimals = (animals ?? []).filter((a: any) =>
    a.statusName?.toLowerCase().includes("fatten") || a.categoryName?.toLowerCase().includes("fatten")
  );

  const utils = trpc.useUtils();
  const addWeight = trpc.animals.addWeight.useMutation({
    onSuccess: () => {
      toast.success("Weight recorded");
      utils.animals.list.invalidate();
      setOpen(false);
      setWeight("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            Fattening Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fatteningAnimals.length} animals in fattening
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />Record Weight</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Record Weight</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Animal</Label>
                <Select value={animalId} onValueChange={setAnimalId}>
                  <SelectTrigger><SelectValue placeholder="Select animal" /></SelectTrigger>
                  <SelectContent>
                    {(animals ?? []).map((a: any) => (
                      <SelectItem key={a.animal.id} value={String(a.animal.id)}>{a.animal.animalId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Weight (kg)</Label>
                <Input type="number" placeholder="0.0" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => addWeight.mutate({ animalId: Number(animalId), weighDate: date, weightKg: weight })} disabled={!animalId || !weight || addWeight.isPending}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Fattening Animals</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("animals.animalId")}</TableHead>
                  <TableHead>{t("common.category")}</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Days on Farm</TableHead>
                  <TableHead>{t("fattening.targetWeight")}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fatteningAnimals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No animals currently in fattening.
                    </TableCell>
                  </TableRow>
                ) : (
                  fatteningAnimals.map((a: any) => {
                    const days = Math.floor((Date.now() - new Date(a.animal.acquisitionDate).getTime()) / 86400000);
                    return (
                      <TableRow key={a.animal.id}>
                        <TableCell className="font-mono font-semibold text-primary">{a.animal.animalId}</TableCell>
                        <TableCell>{a.categoryName}</TableCell>
                        <TableCell>{a.groupName}</TableCell>
                        <TableCell>{days}</TableCell>
                        <TableCell>{a.targetWeightKg ? `${parseFloat(a.targetWeightKg).toFixed(1)} kg` : "—"}</TableCell>
                        <TableCell>
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{a.statusName}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setLocation(`/animals/${a.animal.id}`)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
