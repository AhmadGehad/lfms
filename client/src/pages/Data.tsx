import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { Database, Download, FileDown, FileUp, HardDriveDownload, History, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export default function Data() {
  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          Data Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import data from Excel, create full backups, or restore from a backup file.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ExportCard />
        <ImportCard />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <BackupCard />
        <RestoreCard />
      </div>
    </div>
  );
}

// ── Export Excel ────────────────────────────────────────────────────────────
function ExportCard() {
  const [loading, setLoading] = useState(false);
  const utils = trpc.useUtils();

  const handleExport = async () => {
    try {
      setLoading(true);
      const res = await utils.client.export.full.query();
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Excel export downloaded successfully");
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileDown className="h-4 w-4 text-primary" />
          Export to Excel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Download all farm data as a structured Excel workbook (.xlsx). Includes animals, sales, lambing records, weight logs, ration plans, feed stock, and expenses.
        </p>
        <Button onClick={handleExport} disabled={loading} className="gap-2">
          <Download className="h-4 w-4" />
          {loading ? "Generating…" : "Download Excel export"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Import Excel ─────────────────────────────────────────────────────────────
function ImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<any[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const qc = useQueryClient();

  const apply = trpc.import.applyImport.useMutation({
    onSuccess: (res) => {
      setStats(res.stats);
      const allErrors = res.stats.flatMap((s: any) =>
        s.errors.map((e: string) => `${s.sheet}: ${e}`)
      );
      setErrors(allErrors);
      toast.success(`Imported ${res.totalInserted} records`);
      // Invalidate every query — fresh data everywhere
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    setStats(null);
    setErrors([]);
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    apply.mutate({ base64 });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4 text-primary" />
          Import from Excel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Upload an Excel file matching the export format. Existing records are skipped (matched by animal code).
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={apply.isPending} className="gap-2">
          <FileUp className="h-4 w-4" />
          {apply.isPending ? "Importing…" : "Choose Excel file"}
        </Button>

        {stats && (
          <div className="mt-3 space-y-1 text-sm">
            <p className="font-semibold">Import results:</p>
            {stats.map((s: any) => (
              <div key={s.sheet} className="flex items-center gap-3 text-xs">
                <span className="font-medium w-28">{s.sheet}</span>
                <span className="text-green-600">{s.inserted} added</span>
                {s.skipped > 0 && <span className="text-muted-foreground">{s.skipped} skipped</span>}
                {s.errors.length > 0 && <span className="text-amber-600">{s.errors.length} errors</span>}
              </div>
            ))}
          </div>
        )}
        {errors.length > 0 && (
          <details className="text-xs text-amber-700 dark:text-amber-400 mt-2">
            <summary className="cursor-pointer font-medium">Show errors ({errors.length})</summary>
            <ul className="mt-1 list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
              {errors.slice(0, 50).map((e, i) => (
                <li key={i} className="break-all">{e}</li>
              ))}
              {errors.length > 50 && <li>… and {errors.length - 50} more</li>}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ── Backup ───────────────────────────────────────────────────────────────────
function BackupCard() {
  const [loading, setLoading] = useState(false);
  const utils = trpc.useUtils();

  const handleDownload = async () => {
    try {
      setLoading(true);
      const res = await utils.client.backup.download.query();
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Backup downloaded — ${res.stats.animals} animals, ${res.stats.expenses} expenses, ${res.stats.feedStock} stock entries`);
    } catch (e: any) {
      toast.error(e.message ?? "Backup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDriveDownload className="h-4 w-4 text-primary" />
          Download Full Backup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Save a full snapshot of all live data as a single JSON file. Includes animals, sales, lambing, weights, rations, stock, and expenses. Soft-deleted records are excluded.
        </p>
        <Button onClick={handleDownload} disabled={loading} className="gap-2">
          <Download className="h-4 w-4" />
          {loading ? "Generating…" : "Download backup (JSON)"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Restore ──────────────────────────────────────────────────────────────────
function RestoreCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<any | null>(null);
  const qc = useQueryClient();

  const restore = trpc.backup.restore.useMutation({
    onSuccess: (res) => {
      setStats(res);
      const totalRestored = Object.values(res).reduce(
        (sum: number, v: any) => sum + (v.restored ?? 0),
        0
      );
      toast.success(`Restored ${totalRestored} records`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    if (!confirm("Restore will ADD records from this backup to the current database. Records that already exist (matched by animal code) will be skipped. Continue?")) {
      return;
    }
    setStats(null);
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    restore.mutate({ base64 });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Restore from Backup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Upload a JSON backup file. Records already in the database (matched by animal code) are skipped to avoid duplicates.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={restore.isPending} className="gap-2" variant="outline">
          <FileUp className="h-4 w-4" />
          {restore.isPending ? "Restoring…" : "Choose backup file"}
        </Button>

        {stats && (
          <div className="mt-3 space-y-1 text-sm">
            <p className="font-semibold">Restore results:</p>
            {Object.entries(stats).map(([key, val]: [string, any]) => (
              <div key={key} className="flex items-center gap-3 text-xs">
                <span className="font-medium w-28">{key}</span>
                <span className="text-green-600">{val.restored ?? 0} restored</span>
                {(val.skipped ?? 0) > 0 && (
                  <span className="text-muted-foreground">{val.skipped} skipped</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
