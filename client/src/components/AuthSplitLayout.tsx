import "@fontsource-variable/fraunces/index.css";
import { Leaf } from "lucide-react";
import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const DISPLAY_FONT = "\"Fraunces Variable\", Georgia, serif";

function BrandMark({ name, hasLogo, className }: { name: string; hasLogo: boolean; className?: string }) {
  if (hasLogo) {
    return (
      <img
        src="/public/company-logo"
        alt={name}
        className={`rounded-lg object-cover ${className ?? "h-10 w-10"}`}
      />
    );
  }
  return (
    <div className={`grid place-items-center rounded-lg bg-primary text-primary-foreground ${className ?? "h-10 w-10"}`}>
      <Leaf className="h-1/2 w-1/2" />
    </div>
  );
}

/** Shared split-panel chrome for /login, /forgot-password, /reset-password — brand side pulls the current tenant's name/logo, form side is supplied by the caller. */
export function AuthSplitLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const branding = trpc.tenancy.publicBranding.useQuery();
  const farmName = branding.data?.name || "LFMS";
  const hasLogo = Boolean(branding.data?.hasLogo);

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#182619] px-12 py-12 text-[#F7F5EE] lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, #F7F5EE 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative flex items-center gap-3">
          <BrandMark name={farmName} hasLogo={hasLogo} className="h-11 w-11 bg-[#2F5233]" />
          <span className="font-medium tracking-tight">{farmName}</span>
        </div>
        <div className="relative">
          <h1
            className="max-w-md text-4xl font-medium leading-tight"
            style={{ fontFamily: DISPLAY_FONT, fontVariationSettings: "\"SOFT\" 60, \"WONK\" 1" }}
          >
            Every head, every farm, tracked in one place.
          </h1>
          <p className="mt-4 max-w-sm text-sm text-[#F7F5EE]/70">
            Manage animals, breeding, feed, and sales for {farmName}.
          </p>
        </div>
        <p className="relative text-xs text-[#F7F5EE]/50">Livestock Farm Management System</p>
      </section>

      <section className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark name={farmName} hasLogo={hasLogo} />
            <span className="font-medium">{farmName}</span>
          </div>

          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>

          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}
