"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { MailCheck, Loader2, X } from "lucide-react";

// Dismissing hides the reminder for a week on this device.
const DISMISS_MS = 7 * 24 * 60 * 60_000;

// A gentle reminder for users who haven't confirmed their email. It never
// blocks anything; it just offers to resend the link.
export function EmailVerificationBanner() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const impersonating = (session?.user as { impersonatedBy?: string | null } | undefined)?.impersonatedBy;
  const [show, setShow] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const dismissKey = `verify-email-dismissed:${userId}`;

  useEffect(() => {
    if (!userId || impersonating) return;
    const dismissedAt = Number(localStorage.getItem(dismissKey) || 0);
    if (Date.now() - dismissedAt < DISMISS_MS) return;
    let cancelled = false;
    fetch("/api/auth/verify-email")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && !data.verified) setShow(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, impersonating, dismissKey]);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(dismissKey, String(Date.now()));
    setShow(false);
  }

  async function resend() {
    setSending(true);
    setMessage("");
    const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.alreadyVerified) {
      setShow(false);
    } else if (res.ok) {
      setMessage(`Sent! Check ${session?.user?.email ?? "your inbox"}.`);
    } else {
      setMessage(data.error || "Couldn't send the email. Please try again later.");
    }
    setSending(false);
  }

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-brand-soft px-4 py-2.5 text-sm print:hidden"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold">
        <MailCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{message || "Please confirm your email so you can reset your password if you ever need to."}</span>
      </span>
      <span className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={resend} disabled={sending}>
          {sending && <Loader2 className="h-3 w-3 animate-spin" />}
          Resend email
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={dismiss} aria-label="Dismiss email reminder">
          <X className="h-4 w-4" />
        </Button>
      </span>
    </div>
  );
}
