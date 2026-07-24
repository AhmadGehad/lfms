import { Eye, EyeOff, LoaderCircle, Lock, LogIn, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const utils = trpc.useUtils();

  const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
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
      window.location.assign(returnTo);
    } catch {
      setError("Sign-in failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout title="Welcome back" description="Sign in to your company workspace">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <InputGroup>
            <InputGroupAddon>
              <Mail className="h-4 w-4" />
            </InputGroupAddon>
            <InputGroupInput
              id="email"
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
            <Label htmlFor="password">Password</Label>
            <a href="/forgot-password" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Forgot password?
            </a>
          </div>
          <InputGroup>
            <InputGroupAddon>
              <Lock className="h-4 w-4" />
            </InputGroupAddon>
            <InputGroupInput
              id="password"
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
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthSplitLayout>
  );
}
