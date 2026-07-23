import { Leaf } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => null);
      setMessage(body?.message ?? "If that email has an account, a password reset link has been sent.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-sm border-y py-10">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center bg-primary text-primary-foreground">
            <Leaf className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Reset your password</h1>
            <p className="text-sm text-muted-foreground">We'll send a reset link if the account exists</p>
          </div>
        </div>

        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : (
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
