import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

interface FormDialogProps {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: ReactNode;
  cancelLabel?: ReactNode;
  submitting?: boolean;
  submitDisabled?: boolean;
  contentClassName?: string;
}

export function FormDialog({
  title,
  description,
  children,
  trigger,
  open,
  onOpenChange,
  onSubmit,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  submitting = false,
  submitDisabled = false,
  contentClassName,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className={contentClassName}>
        <form onSubmit={onSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">{children}</div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submitting}>
                {cancelLabel}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={submitting || submitDisabled}
              aria-busy={submitting}
            >
              {submitting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
