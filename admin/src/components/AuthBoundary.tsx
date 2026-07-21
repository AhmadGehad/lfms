import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, LoaderCircle } from "lucide-react";
import { FormEvent, type ReactNode, useState } from "react";
import { setPlatformCsrfToken } from "@admin/lib/csrf";
import { platformTrpc } from "@admin/lib/trpc";

export function AuthBoundary({ children }: { children: ReactNode }) {
  const session = platformTrpc.auth.me.useQuery(undefined, { retry: false });
  const utils = platformTrpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/platform/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Sign-in failed");
        return;
      }
      await utils.auth.me.invalidate();
    } catch {
      setError("Sign-in failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (session.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center" aria-busy="true">
        <LoaderCircle
          className="h-6 w-6 animate-spin text-primary"
          aria-label="Checking platform session"
        />
      </main>
    );
  }

  if (!session.data) {
    setPlatformCsrfToken(null);
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section
          className="w-full max-w-sm border border-border bg-card p-6 shadow-sm"
          aria-labelledby="admin-signin-title"
        >
          <ShieldAlert
            className="mb-4 h-7 w-7 text-primary"
            aria-hidden="true"
          />
          <h1 id="admin-signin-title" className="text-lg font-semibold">
            Platform access required
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Only authorized platform administrators can access this panel.
          </p>
          <form className="mt-5 grid gap-3" onSubmit={onSubmit}>
            <div className="grid gap-1.5">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </section>
      </main>
    );
  }

  setPlatformCsrfToken(session.data.csrfToken);
  return children;
}
