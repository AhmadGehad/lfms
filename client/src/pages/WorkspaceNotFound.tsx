import { Mail, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicConfig } from "@/lib/publicConfig";

const fallbackSupportEmail = "support@l-fms.com";

/**
 * Shown when the subdomain doesn't resolve to a real company, instead of the
 * generic login form every tenant subdomain used to render regardless of
 * whether it actually existed.
 */
export default function WorkspaceNotFound() {
  const supportEmail =
    publicConfig.supportEmail?.trim() || fallbackSupportEmail;
  const supportHref = `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent("LFMS workspace not found")}`;

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-center">
      <section className="grid max-w-lg justify-items-center gap-5">
        <span
          className="grid size-14 place-items-center rounded-lg bg-secondary text-muted-foreground"
          aria-hidden="true"
        >
          <SearchX className="size-7" />
        </span>
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold">Workspace not found</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            We couldn't find a workspace at this address. Check the link you
            were given, or contact whoever invited you.
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
