import { Eye, EyeOff, LoaderCircle, Lock, LogIn, Mail, Tablet } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/** A tablet has no email or password, only the one-time code shown on the farm's Tasks page. */
function ConnectTablet({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const failed = t("tasks.connectFailed", "Couldn't connect. Check the internet and try again.");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/tablet-connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (response.ok) {
        window.location.assign("/");
        return;
      }
      setError(response.status === 401 ? t("tasks.connectBadCode", "That code isn't right, or it has expired. Ask the farm owner for a new one.") : failed);
    } catch {
      setError(failed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout title={t("tasks.connectTablet", "Connect a tablet")} description={t("tasks.connectHint", "Type the code shown on the farm's Tasks page.")}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-1.5">
          <Label htmlFor="tablet-code">{t("tasks.connectCode", "Code")}</Label>
          <InputGroup>
            <InputGroupAddon>
              <Tablet className="h-4 w-4" />
            </InputGroupAddon>
            <InputGroupInput
              id="tablet-code"
              dir="ltr"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              required
              maxLength={12}
              value={code}
              onChange={event => setCode(event.target.value)}
              className="font-mono uppercase tracking-widest"
            />
          </InputGroup>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Tablet className="h-4 w-4" />}
          {t("tasks.connectTablet", "Connect a tablet")}
        </Button>
        <button type="button" onClick={onBack} className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {t("tasks.connectUsePassword", "Sign in with email instead")}
        </button>
      </form>
    </AuthSplitLayout>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const [tablet, setTablet] = useState(() => new URLSearchParams(window.location.search).get("tablet") === "1");
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

  if (tablet) return <ConnectTablet onBack={() => setTablet(false)} />;

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
        <button type="button" onClick={() => setTablet(true)} className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {t("tasks.connectTablet", "Connect a tablet")}
        </button>
      </form>
    </AuthSplitLayout>
  );
}
