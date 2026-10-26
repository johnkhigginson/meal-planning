"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Read once after mount (browser-only) to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not reset your password. Please try again.");
      return;
    }
    setDone(true);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-8">
      <h1 className="text-center text-4xl leading-tight font-medium tracking-[-0.02em] sm:text-5xl">
        Choose a new password
      </h1>
      <Card className="rounded-3xl py-7 sm:py-8">
        <CardContent className="px-6 sm:px-8">
          {done ? (
            <div className="space-y-5">
              <p role="status" className="text-sm">
                Your password has been reset. You can now sign in with your new password.
              </p>
              <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                Sign in
              </Link>
            </div>
          ) : token === "" ? (
            <div className="space-y-5">
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
                This reset link is missing its token. Please use the link from your email, or request a new one.
              </p>
              <Link href="/forgot-password" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div role="alert" className="space-y-1 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
                  <p>{error}</p>
                  {error.includes("expired") && (
                    <Link href="/forgot-password" className="underline underline-offset-4">
                      Request a new link
                    </Link>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">At least 8 characters</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={loading || token === null}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Reset password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
