import { AlertTriangle, CheckCircle2, Leaf, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

const INVITATION_STORAGE_KEY = "lfms.pendingInvitation";

function readInvitationCredential() {
  const fragmentCredential = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (fragmentCredential && /^[A-Za-z0-9_-]{43}$/.test(fragmentCredential)) {
    sessionStorage.setItem(INVITATION_STORAGE_KEY, fragmentCredential);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return fragmentCredential;
  }
  return sessionStorage.getItem(INVITATION_STORAGE_KEY) ?? "";
}

export default function AcceptInvitation() {
  const [token] = useState(readInvitationCredential);
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  // This safe request establishes the CSRF cookie before the credential-bearing
  // preview mutation. The invitation token remains out of URLs and server logs.
  const identity = trpc.auth.invitationIdentity.useQuery(undefined, { retry: false });
  const preview = trpc.invitations.preview.useMutation();
  useEffect(() => {
    if (identity.isFetched && validToken && !preview.data && !preview.isPending && !preview.isError) {
      preview.mutate({ token });
    }
  }, [identity.isFetched, preview, token, validToken]);
  const accept = trpc.invitations.accept.useMutation({
    onSuccess: () => {
      sessionStorage.removeItem(INVITATION_STORAGE_KEY);
      window.location.replace("/");
    },
  });
  const invitation = preview.data;
  const unavailable = !validToken || preview.isError || (invitation && !invitation.canAccept);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-lg border-y py-10">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center bg-primary text-primary-foreground">
            <Leaf className="h-6 w-6" />
          </div>
          <div><h1 className="text-xl font-semibold">LFMS company invitation</h1><p className="text-sm text-muted-foreground">Secure company access</p></div>
        </div>

        {preview.isPending && <p className="text-sm text-muted-foreground">Checking invitation...</p>}

        {unavailable && !preview.isPending && (
          <div className="flex gap-3 border-l-4 border-destructive px-4 py-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div><h2 className="font-medium">Invitation unavailable</h2><p className="mt-1 text-sm text-muted-foreground">This link is invalid, expired, revoked, accepted, or belongs to another company.</p></div>
          </div>
        )}

        {invitation?.canAccept && (
          <div className="grid gap-6">
            <div className="grid gap-3 border-y py-4 text-sm">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Company</span><strong>{invitation.companyName}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Role</span><strong className="capitalize">{invitation.role}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Invited identity</span><strong>{invitation.email}</strong></div>
            </div>

            {!identity.data ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">Sign in with the verified email invited to this company.</p>
                <Button onClick={() => { window.location.href = getLoginUrl(); }}><LogIn className="h-4 w-4" />Sign in to accept</Button>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="flex items-start gap-3 text-sm"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /><p>Signed in as <strong>{identity.data.email || identity.data.name || "authenticated user"}</strong>. Acceptance is allowed only when the verified account email matches the invitation.</p></div>
                <Button disabled={accept.isPending} onClick={() => accept.mutate({ token })}>{accept.isPending ? "Accepting..." : "Accept invitation"}</Button>
                {accept.isError && <p role="alert" className="text-sm text-destructive">{accept.error.message}</p>}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
