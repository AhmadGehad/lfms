import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Download, FileUp, HardDriveDownload, History, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/usePermissions";

type ImportMode = "append" | "replace";

export default function Data() {
  const { t } = useTranslation();
  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          {t("data.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("data.subtitle")}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ImportCard />
        <BackupCard />
      </div>

      <RestoreCard />
    </div>
  );
}

// ── Import Excel ─────────────────────────────────────────────────────────────
function ImportCard() {
  const { t } = useTranslation();
  const { canImport } = usePermissions("data");
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<any[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<ImportMode>("append");
  const qc = useQueryClient();

  const apply = trpc.import.applyImport.useMutation({
    onSuccess: (res) => {
      setStats(res.stats);
      const allErrors = res.stats.flatMap((s: any) =>
        s.errors.map((e: string) => `${s.sheet}: ${e}`)
      );
      setErrors(allErrors);
      toast.success(`${t("data.added")}: ${res.totalInserted}`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    if (mode === "replace" && !confirm(t("data.replaceConfirm"))) return;
    setStats(null);
    setErrors([]);
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    apply.mutate({ base64, mode });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4 text-primary" />
          {t("data.importTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("data.importDesc")}</p>
        <ModeSelect mode={mode} onChange={setMode} source="excel" allowReplace={false} />
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
        {canImport && <Button onClick={() => fileRef.current?.click()} disabled={apply.isPending} className="gap-2">
          <FileUp className="h-4 w-4" />
          {apply.isPending ? t("data.importing") : t("data.chooseExcel")}
        </Button>}

        {stats && (
          <div className="mt-3 space-y-1 text-sm">
            <p className="font-semibold">{t("data.importResults")}</p>
            {stats.map((s: any) => (
              <div key={s.sheet} className="flex items-center gap-3 text-xs">
                <span className="font-medium w-28">{s.sheet}</span>
                <span className="text-green-600">{s.inserted} {t("data.added")}</span>
                {s.skipped > 0 && <span className="text-muted-foreground">{s.skipped} {t("data.skipped")}</span>}
                {s.errors.length > 0 && <span className="text-amber-600">{s.errors.length} {t("data.errors")}</span>}
              </div>
            ))}
          </div>
        )}
        {errors.length > 0 && (
          <details className="text-xs text-amber-700 dark:text-amber-400 mt-2">
            <summary className="cursor-pointer font-medium">{t("data.showErrors")} ({errors.length})</summary>
            <ul className="mt-1 list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
              {errors.slice(0, 50).map((e, i) => (
                <li key={i} className="break-all">{e}</li>
              ))}
              {errors.length > 50 && <li>… {errors.length - 50}+</li>}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ── Backup ───────────────────────────────────────────────────────────────────
function BackupCard() {
  const { t } = useTranslation();
  const { canExport } = usePermissions("data");
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
      toast.success(`${Object.values(res.stats).reduce((sum, count) => sum + Number(count), 0)} ${t("data.recordsExported")}`);
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
          {t("data.backupTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("data.backupDesc")}</p>
        {canExport && <Button onClick={handleDownload} disabled={loading} className="gap-2">
          <Download className="h-4 w-4" />
          {loading ? t("data.generating") : t("data.downloadBackup")}
        </Button>}
      </CardContent>
    </Card>
  );
}

// ── Restore ──────────────────────────────────────────────────────────────────
function RestoreCard() {
  const { t } = useTranslation();
  const { canRestore } = usePermissions("data");
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [mode, setMode] = useState<ImportMode>("append");
  const qc = useQueryClient();

  const restore = trpc.backup.restore.useMutation({
    onSuccess: (res) => {
      setStats(res.stats);
      const totalRestored = Object.values(res.stats).reduce(
        (sum: number, v: any) => sum + (v.restored ?? 0),
        0
      );
      toast.success(`${t("data.restored")}: ${totalRestored}`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    if (!confirm(mode === "replace" ? t("data.replaceConfirm") : t("data.appendConfirm"))) {
      return;
    }
    setStats(null);
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    restore.mutate({ base64, mode });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          {t("data.restoreTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("data.restoreDesc")}</p>
        <ModeSelect mode={mode} onChange={setMode} source="json" allowReplace={false} />
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
        {canRestore && <Button onClick={() => fileRef.current?.click()} disabled={restore.isPending} className="gap-2" variant="outline">
          <FileUp className="h-4 w-4" />
          {restore.isPending ? t("data.restoring") : t("data.chooseBackup")}
        </Button>}

        {stats && (
          <div className="mt-3 space-y-1 text-sm">
            <p className="font-semibold">{t("data.restoreResults")}</p>
            {Object.entries(stats).map(([key, val]: [string, any]) => (
              <div key={key} className="flex items-center gap-3 text-xs">
                <span className="font-medium w-28">{key}</span>
                <span className="text-green-600">{val.restored ?? 0} {t("data.restored")}</span>
                {(val.skipped ?? 0) > 0 && (
                  <span className="text-muted-foreground">{val.skipped} {t("data.skipped")}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModeSelect({
  mode,
  onChange,
  source,
  allowReplace = true,
}: {
  mode: ImportMode;
  onChange: (mode: ImportMode) => void;
  source: "excel" | "json";
  allowReplace?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Select value={mode} onValueChange={(value) => onChange(value as ImportMode)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="append">{t("data.appendMode")}</SelectItem>
          {allowReplace && <SelectItem value="replace">{t("data.replaceMode")}</SelectItem>}
        </SelectContent>
      </Select>
      <p className={`text-xs flex items-start gap-1.5 ${mode === "replace" ? "text-destructive" : "text-muted-foreground"}`}>
        {mode === "replace" && <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
        {mode === "replace"
          ? t("data.replaceModeDesc")
          : t(source === "excel" ? "data.appendModeDescExcel" : "data.appendModeDesc")}
      </p>
    </div>
  );
}
