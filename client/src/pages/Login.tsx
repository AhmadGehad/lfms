import "@fontsource-variable/fraunces/index.css";
import { Eye, EyeOff, Leaf, LoaderCircle, Lock, LogIn, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

const DISPLAY_FONT = "\"Fraunces Variable\", Georgia, serif";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

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

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const utils = trpc.useUtils();
  const branding = trpc.tenancy.publicBranding.useQuery();

  const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
  const farmName = branding.data?.name || "LFMS";
  const hasLogo = Boolean(branding.data?.hasLogo);

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
            Sign in to manage animals, breeding, feed, and sales for {farmName}.
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

          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to {farmName}</p>

          <form className="mt-8 grid gap-4" onSubmit={onSubmit}>
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
        </div>
      </section>
    </main>
  );
}
