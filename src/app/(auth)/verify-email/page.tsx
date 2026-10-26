"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "verifying" | "verified" | "failed";

export default function VerifyEmailPage() {
  const { data: session } = useSession();
  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState("");
  // Tokens are single-use; guard against React running the effect twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("This verification link is missing its token.");
      setStatus("failed");
      return;
    }
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      if (res.ok) {
        setStatus("verified");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "We couldn't verify your email.");
        setStatus("failed");
      }
    });
  }, []);

  const next = session ? { href: "/", label: "Go to my kitchen" } : { href: "/login", label: "Sign in" };

  return (
    <div className="flex w-full max-w-md flex-col gap-8">
      <h1 className="text-center text-4xl leading-tight font-medium tracking-[-0.02em] sm:text-5xl">
        Confirm your email
      </h1>
      <Card className="rounded-3xl py-7 sm:py-8">
        <CardContent className="space-y-5 px-6 sm:px-8">
          {status === "verifying" && (
            <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Confirming your email...
            </p>
          )}
          {status === "verified" && (
            <p role="status" className="text-sm">
              Thanks! Your email is confirmed.
            </p>
          )}
          {status === "failed" && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
              {error} {session
                ? "You can send a new link from the reminder at the top of the app."
                : "Sign in to send a new link."}
            </p>
          )}
          {status !== "verifying" && (
            <Link href={next.href} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
              {next.label}
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
