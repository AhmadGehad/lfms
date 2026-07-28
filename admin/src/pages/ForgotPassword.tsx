import { Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/platform/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => null);
      setMessage(body?.message ?? "If that email has a platform administrator account, a password reset link has been sent.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout title="Reset platform password" description="We'll send a reset link if the account exists">
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="admin-forgot-email">Email</Label>
            <InputGroup>
              <InputGroupAddon>
                <Mail className="h-4 w-4" />
              </InputGroupAddon>
              <InputGroupInput
                id="admin-forgot-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </InputGroup>
          </div>
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthSplitLayout>
  );
}
