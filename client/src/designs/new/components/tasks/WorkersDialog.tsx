import { Camera, Pencil, Plus, Tablet, Trash2 } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import { WorkerFace } from "@/worker/Pickers";
import { ConsequenceConfirm } from "../ConsequenceConfirm";
import { ICON_BUTTON, PLAIN_BUTTON, PRIMARY_BUTTON, useErrorText, type WorkerRow } from "./shared";

const PHOTO_SIZE = 512;

/** Phone photos are many megabytes; a face on a tablet button needs a few dozen kilobytes. */
async function shrinkPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

function WorkerLine({ worker }: { worker: WorkerRow }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const errorText = useErrorText();
  const { canUpdate } = usePermissions("tasks");
  const [renaming, setRenaming] = useState<string | null>(null);
  const refresh = () => void utils.tasks.invalidate();
  const onError = (error: { message: string }) => toast.error(errorText(error.message));
  const update = trpc.tasks.updateWorker.useMutation({
    onSuccess: () => { refresh(); setRenaming(null); },
    onError,
  });
  const setPhoto = trpc.tasks.setWorkerPhoto.useMutation({ onSuccess: refresh, onError });

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPhoto.mutate({ id: worker.id, expectedVersion: worker.version, dataUrl: await shrinkPhoto(file) });
    } catch {
      toast.error(t("tasks.photoUnreadable", "Couldn't read this photo. Try a JPEG or PNG."));
    }
  };
  const rename = () => {
    if (renaming?.trim()) update.mutate({ id: worker.id, expectedVersion: worker.version, name: renaming, isActive: worker.isActive });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <WorkerFace worker={worker} className="h-11 w-11 shrink-0 text-sm" />
      {renaming === null ? (
        <span className="min-w-0 flex-1 break-words font-medium text-foreground">{worker.name}</span>
      ) : (
        <form className="flex min-w-40 flex-1 gap-2" onSubmit={event => { event.preventDefault(); rename(); }}>
          <Input autoFocus value={renaming} maxLength={80} aria-label={t("tasks.name", "Name")} onChange={e => setRenaming(e.target.value)} />
          <button type="submit" disabled={update.isPending} className={PRIMARY_BUTTON}>{t("common.save", "Save")}</button>
        </form>
      )}
      {canUpdate && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setRenaming(renaming === null ? worker.name : null)} className={ICON_BUTTON} aria-label={t("tasks.renameWorker", "Rename worker")} title={t("tasks.renameWorker", "Rename worker")}>
            <Pencil className="h-4 w-4" />
          </button>
          <label className={`${ICON_BUTTON} cursor-pointer focus-within:outline-2 focus-within:outline-ring`} title={t("tasks.addPhoto", "Add photo")}>
            <Camera className="h-4 w-4" />
            <span className="sr-only">{t("tasks.addPhoto", "Add photo")}: {worker.name}</span>
            <input type="file" accept="image/*" className="sr-only" disabled={setPhoto.isPending} onChange={event => void choosePhoto(event)} />
          </label>
          {worker.photoUrl && (
            <button type="button" disabled={setPhoto.isPending} onClick={() => setPhoto.mutate({ id: worker.id, expectedVersion: worker.version, dataUrl: null })} className={ICON_BUTTON} aria-label={t("tasks.removePhoto", "Remove photo")} title={t("tasks.removePhoto", "Remove photo")}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <Switch
            checked={worker.isActive}
            disabled={update.isPending}
            className="ms-2"
            aria-label={`${t("tasks.allowed", "Allowed to do tasks")}: ${worker.name}`}
            title={t("tasks.allowed", "Allowed to do tasks")}
            onCheckedChange={isActive => update.mutate({ id: worker.id, expectedVersion: worker.version, name: worker.name, isActive })}
          />
        </div>
      )}
    </li>
  );
}

/** Connecting takes a one-time code typed on the tablet. No email, password or Admin involved. */
function ConnectTablets() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const errorText = useErrorText();
  const { canCreate, canUpdate } = usePermissions("tasks");
  const status = trpc.tasks.tabletStatus.useQuery(undefined, { refetchInterval: 10_000 });
  const [code, setCode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const onError = (error: { message: string }) => toast.error(errorText(error.message));
  const create = trpc.tasks.createTabletCode.useMutation({ onSuccess: result => setCode(result.code), onError });
  const disconnect = trpc.tasks.disconnectTablets.useMutation({
    onSuccess: () => { void utils.tasks.tabletStatus.invalidate(); setCode(null); toast.success(t("tasks.tabletsDisconnected", "Tablets disconnected")); },
    onError,
  });
  const address = `${window.location.origin}/login?tablet=1`;

  return (
    <section className="mt-2 space-y-3 border-t border-border pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Tablet className="h-4 w-4" aria-hidden="true" />
        {t("tasks.connectTablet", "Connect a tablet")}
      </h3>
      <p className="text-sm text-muted-foreground">
        {status.data?.connected
          ? t("tasks.tabletConnected", "A tablet is connected to this farm.")
          : t("tasks.tabletNotConnected", "No tablet is connected yet.")}
      </p>
      {code && (
        <div className="space-y-2 rounded-lg bg-surface p-3" role="status">
          <p className="text-sm text-foreground">{t("tasks.tabletOpen", "On the tablet, open this address:")}</p>
          <p className="break-all font-mono text-sm text-foreground" dir="ltr">{address}</p>
          <p className="text-sm text-foreground">{t("tasks.tabletType", "Then type this code. It works once, for 15 minutes:")}</p>
          <p className="font-mono text-3xl font-bold tracking-widest text-foreground" dir="ltr" data-testid="tablet-code">{code}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {canCreate && (
          <button type="button" disabled={create.isPending} onClick={() => create.mutate()} className={PRIMARY_BUTTON}>
            {code ? t("tasks.newCode", "New code") : t("tasks.getCode", "Get a code")}
          </button>
        )}
        {canUpdate && status.data?.connected && (
          <button type="button" onClick={() => setConfirming(true)} className={PLAIN_BUTTON}>{t("tasks.disconnect", "Disconnect tablets")}</button>
        )}
      </div>
      <ConsequenceConfirm
        open={confirming}
        onOpenChange={setConfirming}
        title={t("tasks.disconnectTitle", "Disconnect this farm's tablets?")}
        consequences={[{ text: t("tasks.disconnectConsequence", "Every tablet here is signed out straight away. Connecting one again takes a new code."), tone: "warning" }]}
        confirmLabel={t("tasks.disconnect", "Disconnect tablets")}
        destructive
        onConfirm={() => { setConfirming(false); disconnect.mutate(); }}
      />
    </section>
  );
}

/** The names on the tablet, and the tablet itself. Workers need no email, so nothing here touches Admin. */
export function WorkersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const errorText = useErrorText();
  const { canCreate } = usePermissions("tasks");
  const workers = trpc.tasks.listWorkers.useQuery(undefined, { enabled: open });
  const [name, setName] = useState("");
  const create = trpc.tasks.createWorker.useMutation({
    onSuccess: () => { void utils.tasks.invalidate(); setName(""); },
    onError: error => toast.error(errorText(error.message)),
  });
  const list = workers.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{t("tasks.workers", "Workers")}</DialogTitle></DialogHeader>
        {canCreate && (
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); if (name.trim()) create.mutate({ name }); }}>
            <Input value={name} maxLength={80} placeholder={t("tasks.name", "Name")} aria-label={t("tasks.name", "Name")} onChange={e => setName(e.target.value)} />
            <button type="submit" disabled={create.isPending || !name.trim()} className={`${PRIMARY_BUTTON} flex shrink-0 items-center gap-1.5`}>
              <Plus className="h-4 w-4" />
              {t("tasks.addWorker", "Add worker")}
            </button>
          </form>
        )}
        {list.length === 0 ? (
          workers.isLoading ? null : <p className="py-2 text-sm text-muted-foreground">{t("tasks.noWorkersHint", "Add each worker's name. They pick it on the tablet when they start. No password needed.")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map(worker => <WorkerLine key={worker.id} worker={worker} />)}
          </ul>
        )}
        <ConnectTablets />
      </DialogContent>
    </Dialog>
  );
}
