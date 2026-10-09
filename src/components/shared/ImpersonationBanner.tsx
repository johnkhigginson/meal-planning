"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { UserCog, Loader2 } from "lucide-react";

// Shown whenever the current session was started by an admin impersonating
// another user. Offers a one-click return to the admin's own account.
export function ImpersonationBanner() {
  const { data: session } = useSession();
  const [leaving, setLeaving] = useState(false);

  const impersonating = (session?.user as { impersonatedBy?: string | null } | undefined)?.impersonatedBy;
  if (!impersonating) return null;

  async function stop() {
    setLeaving(true);
    const res = await fetch("/api/admin/stop-impersonate", { method: "POST" });
    if (!res.ok) {
      setLeaving(false);
      return;
    }
    const { token } = await res.json();
    await signIn("impersonate", { token, redirect: false });
    window.location.assign("/admin");
  }

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background print:hidden"
    >
      <span className="flex items-center gap-2">
        <UserCog className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Viewing as <strong className="font-extrabold">{session?.user?.name}</strong>
        </span>
      </span>
      <Button
        size="sm"
        className="focus-visible:ring-brand/60"
        onClick={stop}
        disabled={leaving}
      >
        {leaving && <Loader2 className="h-3 w-3 animate-spin" />}
        Return to my account
      </Button>
    </div>
  );
}
