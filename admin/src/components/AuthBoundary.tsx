import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, type ReactNode, useState } from "react";
import { setPlatformCsrfToken } from "@admin/lib/csrf";
import { platformTrpc } from "@admin/lib/trpc";

export function AuthBoundary({ children }: { children: ReactNode }) {
  const session = platformTrpc.auth.me.useQuery(undefined, { retry: false });
  const utils = platformTrpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      <main className="grid min-h-screen place-items-center bg-background" aria-busy="true">
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
      <AuthSplitLayout title="Platform access" description="Only authorized platform administrators can sign in.">
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <InputGroup>
              <InputGroupAddon>
                <Mail className="h-4 w-4" />
              </InputGroupAddon>
              <InputGroupInput
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </InputGroup>
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="admin-password">Password</Label>
              <a href="/forgot-password" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                Forgot password?
              </a>
            </div>
            <InputGroup>
              <InputGroupAddon>
                <Lock className="h-4 w-4" />
              </InputGroupAddon>
              <InputGroupInput
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <button
                  type="button"
                  onClick={() => setShowPassword(current => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </InputGroupAddon>
            </InputGroup>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </AuthSplitLayout>
    );
  }

  setPlatformCsrfToken(session.data.csrfToken);
  return children;
}
