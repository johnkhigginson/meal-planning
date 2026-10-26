"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong. Please try again.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-8">
      <h1 className="text-center text-4xl leading-tight font-medium tracking-[-0.02em] sm:text-5xl">
        Forgot your password?
      </h1>
      <Card className="rounded-3xl py-7 sm:py-8">
        <CardContent className="px-6 sm:px-8">
          {sent ? (
            <div className="space-y-5">
              <p role="status" className="text-sm">
                If an account exists for <strong>{email}</strong>, we sent a link to reset your
                password. The link expires in 1 hour.
              </p>
              <p className="text-sm text-muted-foreground">
                Don&apos;t see it? Check your spam folder, or try again in a few minutes.
              </p>
              <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
                  {error}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Enter the email you signed up with and we&apos;ll send you a link to choose a new password.
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link href="/login" className="font-bold text-primary underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
