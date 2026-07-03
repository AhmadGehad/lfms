import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { Database, Download, RotateCcw, Upload } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ConsequenceConfirm } from "../components/ConsequenceConfirm";

type Mode = "append" | "replace";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function Card({ icon: Icon, title, desc, children }: { icon: typeof Download; title: React.ReactNode; desc: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>
      {children}
    </section>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
      {(["append", "replace"] as Mode[]).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`min-h-11 rounded-md px-3 py-1 font-medium sm:min-h-8 ${mode === m ? (m === "replace" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground") : "text-muted-foreground hover:text-foreground"}`}
        >
          {t(`data.${m}`, m)}
        </button>
      ))}
    </div>
  );
}

/**
 * New Data management. Export / import / restore on redesigned cards. Replace
 * operations (which wipe existing data before loading) are gated behind a
 * ConsequenceConfirm (fixes F-DATA1 one-click destructive restore). Same tRPC +
 * permissions as Old.
 */
export default function NewData() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const utils = trpc.useUtils();
  const perms = usePermissions();
  const canImport = perms.can("data", "import");
  const canExport = perms.can("data", "export");
  const canRestore = perms.can("data", "restore");

  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<Mode>("append");
  const [restoreMode, setRestoreMode] = useState<Mode>("append");
  const [downloading, setDownloading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ kind: "import" | "restore"; file: File } | null>(null);

  const apply = trpc.import.applyImport.useMutation({
    onSuccess: (res: any) => { qc.invalidateQueries(); toast.success(`${t("data.added", "Added")}: ${res.totalInserted}`); },
    onError: e => toast.error(e.message),
  });
  const restore = trpc.backup.restore.useMutation({
    onSuccess: (res: any) => {
      qc.invalidateQueries();
      const total = Object.values(res ?? {}).reduce((s: number, v: any) => s + (v?.restored ?? 0), 0);
      toast.success(`${t("data.restored", "Restored")}: ${total}`);
    },
    onError: e => toast.error(e.message),
  });

  const runImport = async (file: File) => apply.mutate({ base64: await fileToBase64(file), mode: importMode } as any);
  const runRestore = async (file: File) => restore.mutate({ base64: await fileToBase64(file), mode: restoreMode } as any);

  const onFilePicked = (kind: "import" | "restore", file: File) => {
    const mode = kind === "import" ? importMode : restoreMode;
    if (mode === "replace") { setPendingFile({ kind, file }); return; } // confirm first
    kind === "import" ? runImport(file) : runRestore(file);
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await utils.client.backup.download.query();
      const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("data.exported", "Backup downloaded"));
    } catch (e: any) {
      toast.error(e.message ?? "Backup failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={t("nav.dataManagement", "Data management")} subtitle={t("data.subtitle", "Export, import and restore farm data")} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {canExport && (
          <Card icon={Download} title={t("data.exportTitle", "Export backup")} desc={t("data.exportDesc", "Download a full snapshot of all farm data.")}>
            <button onClick={handleDownload} disabled={downloading} className="flex min-h-11 w-fit items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:min-h-9">
              <Download className="h-4 w-4" />{downloading ? t("data.generating", "Generating…") : t("data.downloadBackup", "Download backup")}
            </button>
          </Card>
        )}

        {canImport && (
          <Card icon={Upload} title={t("data.importTitle", "Import (Excel)")} desc={t("data.importDesc", "Load records from an .xlsx workbook.")}>
            <ModeToggle mode={importMode} onChange={setImportMode} />
            <input ref={importRef} type="file" accept=".xlsx,.xlsm" className="hidden" aria-label={t("data.chooseExcel", "Choose file")} onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked("import", f); e.target.value = ""; }} />
            <button onClick={() => importRef.current?.click()} disabled={apply.isPending} className="flex min-h-11 w-fit items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface disabled:opacity-50 sm:min-h-9">
              <Upload className="h-4 w-4" />{apply.isPending ? t("data.importing", "Importing…") : t("data.chooseExcel", "Choose file")}
            </button>
          </Card>
        )}

        {canRestore && (
          <Card icon={RotateCcw} title={t("data.restoreTitle", "Restore backup")} desc={t("data.restoreDesc", "Restore from a JSON backup file.")}>
            <ModeToggle mode={restoreMode} onChange={setRestoreMode} />
            <input ref={restoreRef} type="file" accept=".json" className="hidden" aria-label={t("data.chooseBackup", "Choose backup")} onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked("restore", f); e.target.value = ""; }} />
            <button onClick={() => restoreRef.current?.click()} disabled={restore.isPending} className="flex min-h-11 w-fit items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface disabled:opacity-50 sm:min-h-9">
              <RotateCcw className="h-4 w-4" />{restore.isPending ? t("data.restoring", "Restoring…") : t("data.chooseBackup", "Choose backup")}
            </button>
          </Card>
        )}
      </div>

      <ConsequenceConfirm
        open={pendingFile !== null}
        onOpenChange={o => !o && setPendingFile(null)}
        title={t("data.replaceTitle", "Replace existing data?")}
        consequences={[
          { text: t("data.replaceConsequence", "Replace mode DELETES current records before loading the file. This cannot be undone — export a backup first."), tone: "danger" },
        ]}
        confirmLabel={t("data.replaceConfirmBtn", "Replace data")}
        destructive
        loading={apply.isPending || restore.isPending}
        onConfirm={() => {
          if (!pendingFile) return;
          pendingFile.kind === "import" ? runImport(pendingFile.file) : runRestore(pendingFile.file);
          setPendingFile(null);
        }}
      />
    </div>
  );
}
