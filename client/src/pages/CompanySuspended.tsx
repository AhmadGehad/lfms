import { CirclePause, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicConfig } from "@/lib/publicConfig";

const fallbackSupportEmail = "support@l-fms.com";

export default function CompanySuspended() {
  const supportEmail =
    publicConfig.supportEmail?.trim() || fallbackSupportEmail;
  const supportHref = `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent("LFMS company access suspended")}`;

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-center">
      <section className="grid max-w-lg justify-items-center gap-5">
        <span
          className="grid size-14 place-items-center rounded-lg bg-warning-soft text-warning-soft-foreground"
          aria-hidden="true"
        >
          <CirclePause className="size-7" />
        </span>
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold">Company access suspended</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            This farm workspace is temporarily unavailable. Your records remain
            protected and unchanged.
          </p>
        </div>
        <Button asChild>
          <a href={supportHref}>
            <Mail className="size-4" />
            Contact support
          </a>
        </Button>
      </section>
    </main>
  );
}
