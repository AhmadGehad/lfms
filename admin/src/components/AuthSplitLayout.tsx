import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

/** Shared split-panel chrome for the admin login, forgot-password, and reset-password pages. */
export function AuthSplitLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#0B1220] px-12 py-12 text-slate-100 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, #93c5fd 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#1b79c9]">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <span className="font-medium tracking-tight">LFMS Platform Operations</span>
        </div>
        <div className="relative">
          <h1 className="max-w-md text-4xl font-medium leading-tight">
            Every tenant, every farm, one control plane.
          </h1>
          <p className="mt-4 max-w-sm text-sm text-slate-100/70">
            Manage companies, plans, and platform access.
          </p>
        </div>
        <p className="relative text-xs text-slate-100/50">Restricted to authorized platform administrators</p>
      </section>

      <section className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary">
              <ShieldCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-medium">LFMS Platform Operations</span>
          </div>

          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>

          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}
