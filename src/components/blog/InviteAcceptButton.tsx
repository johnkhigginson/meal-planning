"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Accepts a cookbook collaboration invite for the signed-in user, then sends
// them to the cookbook (or its public blog).
export function InviteAcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/invite/${token}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not accept the invitation.");
        return;
      }
      router.push(data.bookId ? `/books/${data.bookId}` : "/");
    } catch {
      setError("Could not accept the invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={accept} disabled={busy} className="w-full">
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Accept invitation
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
