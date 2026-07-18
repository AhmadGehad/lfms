import { Button } from "@/components/ui/button";
import { ShieldAlert, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { setPlatformCsrfToken } from "@admin/lib/csrf";
import { platformTrpc } from "@admin/lib/trpc";

const loginUrl = import.meta.env.VITE_PLATFORM_LOGIN_URL || "/api/platform/auth/login";

export function AuthBoundary({ children }: { children: ReactNode }) {
  const session = platformTrpc.auth.me.useQuery(undefined, { retry: false });

  if (session.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center" aria-busy="true">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" aria-label="Checking platform session" />
      </main>
    );
  }

  if (!session.data) {
    setPlatformCsrfToken(null);
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="w-full max-w-sm border border-border bg-card p-6 shadow-sm" aria-labelledby="admin-signin-title">
          <ShieldAlert className="mb-4 h-7 w-7 text-primary" aria-hidden="true" />
          <h1 id="admin-signin-title" className="text-lg font-semibold">Platform access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use an approved workforce account with platform permissions and MFA.
          </p>
          <Button className="mt-5 w-full" asChild>
            <a href={loginUrl}>Sign in to platform operations</a>
          </Button>
        </section>
      </main>
    );
  }

  setPlatformCsrfToken(session.data.csrfToken);
  return children;
}
