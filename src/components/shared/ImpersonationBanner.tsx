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
    <div className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span className="flex items-center gap-1.5">
        <UserCog className="h-4 w-4" />
        Viewing as <strong>{session?.user?.name}</strong>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-amber-700/40 bg-white/80 hover:bg-white"
        onClick={stop}
        disabled={leaving}
      >
        {leaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        Return to my account
      </Button>
    </div>
  );
}
